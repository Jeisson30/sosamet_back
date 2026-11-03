const XLSX = require('xlsx');
const db = require('../../config/db');

/**
 * Informe Costos por insumo (v1):
 * - Detalle Excel: insumo × constructora × proyecto
 * - Reporte gráfico: agregado por insumo (+ UM) según diseño
 * - Valor contratado/unitario = valor_base / cant (ponderado)
 * - Utilidad = valor_base * porc_ut (AIU); material / MO fab / MO inst = sin dato en BD
 */

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

function sqlFechaTexto(col) {
  return `CASE
    WHEN ${col} IS NULL OR TRIM(${col}) = '' THEN NULL
    WHEN ${col} REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN STR_TO_DATE(SUBSTRING(${col}, 1, 10), '%Y-%m-%d')
    WHEN ${col} REGEXP '^[A-Za-z]{3} [A-Za-z]{3} [0-9]{1,2} [0-9]{4}' THEN STR_TO_DATE(SUBSTRING(${col}, 5, 11), '%b %d %Y')
    WHEN ${col} REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}' THEN STR_TO_DATE(SUBSTRING_INDEX(${col}, ' ', 1), '%d/%m/%Y')
    ELSE NULL
  END`;
}

/** Fracción AIU: 0.19 o 19 → 0.19 */
function normalizePorc(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.abs(n) > 1 ? n / 100 : n;
}

const DETAIL_COLUMNS = [
  { field: 'insumo', header: 'Insumo' },
  { field: 'um', header: 'Unidad de medida' },
  { field: 'constructora', header: 'Constructora' },
  { field: 'proyecto', header: 'Proyecto' },
  { field: 'categoria', header: 'Categoría' },
  { field: 'valor_contratado_promedio', header: 'Valor contratado promedio' },
  { field: 'utilidad_promedio', header: 'Utilidad promedio' },
  { field: 'pct_utilidad', header: '% Utilidad' },
  { field: 'cantidad_total', header: 'Cantidad total' },
  { field: 'contratos', header: 'N° contratos' },
];

const REPORT_COLUMNS = [
  { field: 'insumo', header: 'Insumo' },
  { field: 'um', header: 'Unidad de medida' },
  { field: 'valor_contratado_promedio', header: 'Valor contratado promedio' },
  { field: 'costo_material_promedio', header: 'Costo material promedio' },
  { field: 'pct_material', header: '%' },
  { field: 'mo_fabricacion_promedio', header: 'Mano de obra fabricación promedio' },
  { field: 'pct_fabricacion', header: '%' },
  { field: 'mo_instalacion_promedio', header: 'Mano de obra instalación promedio' },
  { field: 'pct_instalacion', header: '%' },
  { field: 'costo_total_promedio', header: 'Costo total promedio' },
  { field: 'utilidad_promedio', header: 'Utilidad promedio' },
  { field: 'pct_utilidad', header: '%' },
];

function cleanParam(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round(toNumber(n) * 100) / 100;
}

function roundPct(n) {
  return Math.round(toNumber(n) * 10) / 10;
}

function formatInsumoLabel(codigo, nombre) {
  const c = String(codigo ?? '').trim();
  const n = String(nombre ?? '').trim();
  if (c && n) return `${c} - ${n}`;
  return c || n || 'SIN INSUMO';
}

function buildFilters(query) {
  return {
    fecha_desde: cleanParam(query?.fecha_desde),
    fecha_hasta: cleanParam(query?.fecha_hasta),
    categoria_id: cleanParam(query?.categoria_id),
    categoria: cleanParam(query?.categoria),
    insumo_codigo: cleanParam(query?.insumo_codigo),
    insumo: cleanParam(query?.insumo),
    constructora: cleanParam(query?.constructora),
    proyecto: cleanParam(query?.proyecto),
  };
}

async function fetchCostosPorInsumoRows(filtros) {
  const where = [];
  const params = [];

  if (filtros.fecha_desde) {
    where.push(`hdr.fecha_inicio_dt >= ?`);
    params.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    where.push(`hdr.fecha_inicio_dt <= ?`);
    params.push(filtros.fecha_hasta);
  }
  if (filtros.constructora) {
    where.push(`UPPER(TRIM(hdr.constructora)) = UPPER(?)`);
    params.push(filtros.constructora);
  }
  if (filtros.proyecto) {
    where.push(`UPPER(TRIM(hdr.proyecto)) = UPPER(?)`);
    params.push(filtros.proyecto);
  }
  if (filtros.categoria_id) {
    where.push(`cat.id_categoria = ?`);
    params.push(Number(filtros.categoria_id));
  } else if (filtros.categoria) {
    where.push(
      `(UPPER(TRIM(cat_c.nombre)) = UPPER(?) OR UPPER(TRIM(cat_c.prefijo)) = UPPER(?))`
    );
    params.push(filtros.categoria, filtros.categoria);
  }
  if (filtros.insumo_codigo) {
    where.push(`UPPER(TRIM(COALESCE(cat.codigo, it.insumo))) = UPPER(?)`);
    params.push(filtros.insumo_codigo);
  } else if (filtros.insumo) {
    where.push(
      `(UPPER(TRIM(COALESCE(cat.codigo, ''))) = UPPER(?)
        OR UPPER(TRIM(COALESCE(cat.nombre, ''))) = UPPER(?)
        OR UPPER(TRIM(COALESCE(it.insumo, ''))) = UPPER(?))`
    );
    params.push(filtros.insumo, filtros.insumo, filtros.insumo);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(cat.codigo), ''), NULLIF(TRIM(it.insumo), ''), 'SIN') AS insumo_codigo,
      COALESCE(NULLIF(TRIM(cat.nombre), ''), '') AS insumo_nombre,
      COALESCE(NULLIF(TRIM(cat_c.nombre), ''), 'Sin categoría') AS categoria,
      COALESCE(NULLIF(TRIM(cat_c.prefijo), ''), '') AS categoria_prefijo,
      COALESCE(NULLIF(TRIM(hdr.constructora), ''), 'Sin constructora') AS constructora,
      COALESCE(NULLIF(TRIM(hdr.proyecto), ''), 'Sin proyecto') AS proyecto,
      COALESCE(NULLIF(TRIM(it.und), ''), '') AS um,
      SUM(it.cant) AS cantidad_total,
      SUM(it.valor_base) AS valor_base_total,
      SUM(
        it.valor_base * CASE
          WHEN it.porc_ut IS NULL THEN 0
          WHEN ABS(it.porc_ut) > 1 THEN it.porc_ut / 100
          ELSE it.porc_ut
        END
      ) AS utilidad_total,
      COUNT(*) AS items_count,
      COUNT(DISTINCT it.numdoc) AS contratos_count
    FROM (
      SELECT TRIM(numdoc) AS numdoc, item, insumo, descripcion, cant, und, valor_base, porc_ut
        FROM aiu
       WHERE TRIM(IFNULL(item, '')) <> ''
         AND cant IS NOT NULL AND cant > 0
         AND valor_base IS NOT NULL AND valor_base > 0
      UNION ALL
      SELECT TRIM(numdoc) AS numdoc, item, insumo, descripcion, cant, und, valor_base, NULL AS porc_ut
        FROM iva_pleno
       WHERE TRIM(IFNULL(item, '')) <> ''
         AND cant IS NOT NULL AND cant > 0
         AND valor_base IS NOT NULL AND valor_base > 0
    ) it
    INNER JOIN (
      SELECT
        TRIM(numerodoc) AS numerodoc,
        MAX(CASE WHEN nombre_campo_doc = 'empresa' THEN TRIM(valor_campo_doc) END) AS constructora,
        MAX(CASE WHEN nombre_campo_doc = 'proyecto' THEN TRIM(valor_campo_doc) END) AS proyecto,
        ${sqlFechaTexto(
          `MAX(CASE WHEN nombre_campo_doc = 'fecha_inicio' THEN TRIM(valor_campo_doc) END)`
        )} AS fecha_inicio_dt
      FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
      GROUP BY TRIM(numerodoc)
    ) hdr ON hdr.numerodoc = it.numdoc
    LEFT JOIN insumo cat
      ON UPPER(TRIM(cat.codigo)) = UPPER(TRIM(it.insumo))
      OR UPPER(TRIM(cat.nombre)) = UPPER(TRIM(it.insumo))
    LEFT JOIN insumo_categoria cat_c ON cat_c.id_categoria = cat.id_categoria
    ${whereSql}
    GROUP BY
      COALESCE(NULLIF(TRIM(cat.codigo), ''), NULLIF(TRIM(it.insumo), ''), 'SIN'),
      COALESCE(NULLIF(TRIM(cat.nombre), ''), ''),
      COALESCE(NULLIF(TRIM(cat_c.nombre), ''), 'Sin categoría'),
      COALESCE(NULLIF(TRIM(cat_c.prefijo), ''), ''),
      COALESCE(NULLIF(TRIM(hdr.constructora), ''), 'Sin constructora'),
      COALESCE(NULLIF(TRIM(hdr.proyecto), ''), 'Sin proyecto'),
      COALESCE(NULLIF(TRIM(it.und), ''), '')
    ORDER BY constructora, proyecto, insumo_codigo, um
  `;

  const raw = await queryAsync(sql, params);
  return (raw || []).map((r) => {
    const cantidad = toNumber(r.cantidad_total);
    const valorBase = toNumber(r.valor_base_total);
    const utilidadTot = toNumber(r.utilidad_total);
    const vu = cantidad > 0 ? roundMoney(valorBase / cantidad) : 0;
    const util = cantidad > 0 ? roundMoney(utilidadTot / cantidad) : 0;
    const pctUtil = valorBase > 0 ? roundPct((utilidadTot / valorBase) * 100) : 0;
    return {
      insumo_codigo: r.insumo_codigo,
      insumo_nombre: r.insumo_nombre,
      insumo: formatInsumoLabel(r.insumo_codigo, r.insumo_nombre),
      um: r.um || '',
      constructora: r.constructora,
      proyecto: r.proyecto,
      categoria: r.categoria,
      categoria_prefijo: r.categoria_prefijo || '',
      valor_contratado_promedio: vu,
      valor_unitario_promedio: vu,
      costo_material_promedio: null,
      pct_material: null,
      mo_fabricacion_promedio: null,
      pct_fabricacion: null,
      mo_instalacion_promedio: null,
      pct_instalacion: null,
      costo_total_promedio: null,
      utilidad_promedio: util,
      pct_utilidad: pctUtil,
      cantidad_total: roundMoney(cantidad),
      contratos: toNumber(r.contratos_count),
      items: toNumber(r.items_count),
    };
  });
}

/** Agrega por insumo + UM para el reporte gráfico del diseño. */
function buildReportByInsumo(detailRows) {
  const map = new Map();
  for (const r of detailRows) {
    const key = `${r.insumo_codigo || r.insumo}|${r.um || ''}`;
    const prev = map.get(key) || {
      insumo_codigo: r.insumo_codigo,
      insumo_nombre: r.insumo_nombre,
      insumo: r.insumo,
      um: r.um || '',
      sumVuCant: 0,
      sumUtilCant: 0,
      sumCant: 0,
      sumValorBase: 0,
      sumUtilidad: 0,
    };
    const cant = toNumber(r.cantidad_total);
    prev.sumVuCant += toNumber(r.valor_contratado_promedio) * cant;
    prev.sumUtilCant += toNumber(r.utilidad_promedio) * cant;
    prev.sumCant += cant;
    prev.sumValorBase += toNumber(r.valor_contratado_promedio) * cant;
    prev.sumUtilidad += toNumber(r.utilidad_promedio) * cant;
    map.set(key, prev);
  }

  return Array.from(map.values())
    .map((x) => {
      const vu = x.sumCant > 0 ? roundMoney(x.sumVuCant / x.sumCant) : 0;
      const util = x.sumCant > 0 ? roundMoney(x.sumUtilCant / x.sumCant) : 0;
      const pctUtil = vu > 0 ? roundPct((util / vu) * 100) : 0;
      return {
        insumo_codigo: x.insumo_codigo,
        insumo: x.insumo,
        um: x.um,
        valor_contratado_promedio: vu,
        costo_material_promedio: null,
        pct_material: null,
        mo_fabricacion_promedio: null,
        pct_fabricacion: null,
        mo_instalacion_promedio: null,
        pct_instalacion: null,
        costo_total_promedio: null,
        utilidad_promedio: util,
        pct_utilidad: pctUtil,
        cantidad_total: roundMoney(x.sumCant),
      };
    })
    .sort(
      (a, b) =>
        toNumber(b.valor_contratado_promedio) - toNumber(a.valor_contratado_promedio)
    );
}

function buildKpis(reportRows) {
  if (!reportRows.length) {
    return {
      valor_total_promedio: null,
      costo_material_promedio: null,
      mo_fabricacion_promedio: null,
      mo_instalacion_promedio: null,
      utilidad_promedio: null,
      insumos_distintos: 0,
      filas: 0,
    };
  }
  let sumVu = 0;
  let sumUtil = 0;
  let sumCant = 0;
  for (const r of reportRows) {
    const cant = toNumber(r.cantidad_total) || 1;
    sumVu += toNumber(r.valor_contratado_promedio) * cant;
    sumUtil += toNumber(r.utilidad_promedio) * cant;
    sumCant += cant;
  }
  return {
    valor_total_promedio: sumCant > 0 ? roundMoney(sumVu / sumCant) : 0,
    costo_material_promedio: null,
    mo_fabricacion_promedio: null,
    mo_instalacion_promedio: null,
    utilidad_promedio: sumCant > 0 ? roundMoney(sumUtil / sumCant) : 0,
    insumos_distintos: reportRows.length,
    filas: reportRows.length,
  };
}

function buildChartData(reportRows, kpis) {
  const colors = ['#1e3a5f', '#2e7d32', '#6a1b9a', '#ef6c00', '#c62828', '#0277bd', '#00838f'];
  const bars = reportRows.slice(0, 5).map((r, i) => ({
    label: String(r.insumo || '')
      .replace(/^[A-Z0-9]+\s*-\s*/i, '')
      .trim() || r.insumo,
    valor: toNumber(r.valor_contratado_promedio),
    color: colors[i % colors.length],
  }));
  const max = Math.max(...bars.map((b) => b.valor), 1);
  const barras = bars.map((b) => ({
    ...b,
    pct: Math.round((b.valor / max) * 100),
  }));

  const vu = toNumber(kpis.valor_total_promedio);
  const util = toNumber(kpis.utilidad_promedio);
  const utilPct = vu > 0 ? roundPct((util / vu) * 100) : 0;
  const restoPct = roundPct(Math.max(0, 100 - utilPct));

  // Leyenda del diseño (4 componentes). Material / MO aún sin dato en BD.
  const donutLeyenda = [
    {
      label: 'Material',
      pct: null,
      valor: null,
      color: '#1e88e5',
      sin_dato: true,
    },
    {
      label: 'Mano de obra fabricación',
      pct: null,
      valor: null,
      color: '#43a047',
      sin_dato: true,
    },
    {
      label: 'Mano de obra instalación',
      pct: null,
      valor: null,
      color: '#8e24aa',
      sin_dato: true,
    },
    {
      label: 'Utilidad',
      pct: util > 0 ? utilPct : null,
      valor: util > 0 ? util : null,
      color: '#fb8c00',
      sin_dato: !(util > 0),
    },
  ];

  // Rebanadas reales del pastel (SVG): resto sin desglose + utilidad AIU.
  const donutSlices = [];
  if (vu > 0) {
    if (restoPct > 0) {
      donutSlices.push({
        label: 'Sin desglose de costo',
        pct: restoPct,
        valor: roundMoney(Math.max(0, vu - util)),
        color: '#90caf9',
      });
    }
    if (util > 0 && utilPct > 0) {
      donutSlices.push({
        label: 'Utilidad',
        pct: utilPct,
        valor: util,
        color: '#fb8c00',
      });
    }
  }

  return {
    barras_valor_unitario: barras,
    donut_componentes: donutLeyenda,
    donut_slices: donutSlices,
  };
}

const getCostosPorInsumoPreview = async (req, res) => {
  try {
    const filtros = buildFilters(req.query || {});
    const detailRows = await fetchCostosPorInsumoRows(filtros);
    const reportRows = buildReportByInsumo(detailRows);
    const kpis = buildKpis(reportRows);
    const charts = buildChartData(reportRows, kpis);

    return res.status(200).json({
      code: 1,
      message: 'OK',
      data: {
        columns: REPORT_COLUMNS,
        rows: reportRows,
        meta: {
          reporte: 'Costos por insumo',
          titulo: 'ANÁLISIS DE COSTOS POR INSUMO',
          version: 'valor_unitario_v1',
          filtros,
          kpis,
          charts,
          detail_rows: detailRows,
          detail_columns: DETAIL_COLUMNS,
          sin_desglose_costo: true,
          nota:
            'v1: valor contratado y utilidad (AIU). Costo material / MO fabricación / MO instalación aún no están en el sistema.',
        },
      },
    });
  } catch (err) {
    console.error('getCostosPorInsumoPreview:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al generar la vista previa de costos por insumo.',
      error: err?.message,
    });
  }
};

const exportCostosPorInsumo = async (req, res) => {
  try {
    const filtros = buildFilters(req.query || {});
    const detailRows = await fetchCostosPorInsumoRows(filtros);
    if (!detailRows.length) {
      return res.status(400).json({
        code: 0,
        message: 'No hay datos para exportar con los filtros indicados.',
      });
    }

    const aoa = [DETAIL_COLUMNS.map((c) => c.header)];
    for (const r of detailRows) {
      aoa.push(
        DETAIL_COLUMNS.map((c) => {
          const v = r[c.field];
          return v == null ? '' : v;
        })
      );
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = DETAIL_COLUMNS.map((c) => ({
      wch: Math.min(Math.max(c.header.length + 4, 14), 42),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'COSTOS INSUMO');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=costos-por-insumo-${stamp}.xlsx`
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('exportCostosPorInsumo:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al exportar costos por insumo.',
      error: err?.message,
    });
  }
};

module.exports = {
  getCostosPorInsumoPreview,
  exportCostosPorInsumo,
};
