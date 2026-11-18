const XLSX = require('xlsx');
const db = require('../../config/db');

/**
 * Informe BALANCE GLOBAL DE LA EMPRESA
 * - Alcance = contratos EAV (empresa + fecha_inicio), no solo los que tienen acta
 * - Ventas facturadas = acta_pago + actas_pago_plano de esos contratos
 * - Ganancia / costo / insumos / clientes = proxy AIU de esos contratos
 */

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

const CLIENT_COLORS = [
  '#f9a825',
  '#1e88e5',
  '#43a047',
  '#8e24aa',
  '#ef6c00',
  '#546e7a',
  '#c62828',
  '#00838f',
];

const MONTH_LABELS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
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

function buildFilters(query) {
  return {
    fecha_desde: cleanParam(query?.fecha_desde),
    fecha_hasta: cleanParam(query?.fecha_hasta),
    empresa_asociada: cleanParam(query?.empresa_asociada),
  };
}

function sqlFechaTexto(col) {
  return `CASE
    WHEN ${col} IS NULL OR TRIM(${col}) = '' THEN NULL
    WHEN ${col} REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN STR_TO_DATE(SUBSTRING(${col}, 1, 10), '%Y-%m-%d')
    WHEN ${col} REGEXP '^[A-Za-z]{3} [A-Za-z]{3} [0-9]{1,2} [0-9]{4}' THEN STR_TO_DATE(SUBSTRING(${col}, 5, 11), '%b %d %Y')
    WHEN ${col} REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}' THEN STR_TO_DATE(SUBSTRING_INDEX(${col}, ' ', 1), '%d/%m/%Y')
    ELSE NULL
  END`;
}

function formatInsumoLabel(codigo, nombre) {
  const c = String(codigo ?? '').trim();
  const n = String(nombre ?? '').trim();
  if (c && n) return `${c} - ${n}`;
  return c || n || 'SIN INSUMO';
}

function shortInsumoName(label) {
  return (
    String(label || '')
      .replace(/^[A-Z0-9]+\s*-\s*/i, '')
      .trim() || String(label || 'Otros')
  );
}

function parseMoneda(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let s = String(value).trim().replace(/[$\s]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Contratos del alcance (EAV), filtrados por empresa asociada y fecha_inicio. */
async function fetchScopedContratos(filtros) {
  const where = [];
  const params = [];

  if (filtros.empresa_asociada) {
    where.push(`TRIM(IFNULL(hdr.empresa_asociada, '')) = ?`);
    params.push(filtros.empresa_asociada);
  }
  if (filtros.fecha_desde) {
    where.push(`hdr.fecha_inicio_dt >= ?`);
    params.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    where.push(`hdr.fecha_inicio_dt <= ?`);
    params.push(filtros.fecha_hasta);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT
      hdr.numerodoc AS numero_contrato,
      COALESCE(NULLIF(TRIM(hdr.constructora), ''), 'Sin cliente') AS cliente,
      TRIM(IFNULL(hdr.empresa_asociada, '')) AS empresa_asociada,
      hdr.fecha_inicio_dt AS fecha_inicio,
      hdr.valor_contrato_raw
    FROM (
      SELECT
        TRIM(numerodoc) AS numerodoc,
        MAX(CASE WHEN nombre_campo_doc = 'empresa' THEN TRIM(valor_campo_doc) END) AS constructora,
        MAX(CASE WHEN nombre_campo_doc = 'empresa_asociada' THEN TRIM(valor_campo_doc) END) AS empresa_asociada,
        MAX(CASE WHEN nombre_campo_doc = 'valor_contrato' THEN TRIM(valor_campo_doc) END) AS valor_contrato_raw,
        ${sqlFechaTexto(
          `MAX(CASE WHEN nombre_campo_doc = 'fecha_inicio' THEN TRIM(valor_campo_doc) END)`
        )} AS fecha_inicio_dt
      FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
      GROUP BY TRIM(numerodoc)
    ) hdr
    ${whereSql}
  `;

  const rows = await queryAsync(sql, params);
  return (rows || [])
    .map((r) => ({
      numero_contrato: String(r.numero_contrato || '').trim(),
      cliente: String(r.cliente || 'Sin cliente').trim() || 'Sin cliente',
      empresa_asociada: String(r.empresa_asociada || '').trim(),
      fecha_inicio: r.fecha_inicio || null,
      valor_contrato: parseMoneda(r.valor_contrato_raw) ?? 0,
    }))
    .filter((r) => r.numero_contrato);
}

/**
 * Ventas facturadas: módulo acta_pago + legado actas_pago_plano.
 * Se filtran por contratos del alcance; fechas aplican a la fecha del acta.
 */
async function fetchActasVentas(contratoKeys, filtros) {
  const keys = [
    ...new Set(
      (contratoKeys || []).map((c) => String(c || '').trim()).filter(Boolean)
    ),
  ];
  if (!keys.length) return [];

  const placeholders = keys.map(() => '?').join(',');
  const out = [];

  // Módulo nuevo
  try {
    const where = [
      `UPPER(TRIM(estado)) <> 'ANULADA'`,
      `UPPER(TRIM(COALESCE(NULLIF(TRIM(numero_contrato), ''), NULLIF(TRIM(numerodoc_contrato), '')))) IN (${placeholders})`,
    ];
    const params = [...keys.map((k) => k.toUpperCase())];

    if (filtros.fecha_desde) {
      where.push(
        `COALESCE(fecha_radicado, fecha_emision, DATE(fecha_creacion)) >= ?`
      );
      params.push(filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      where.push(
        `COALESCE(fecha_radicado, fecha_emision, DATE(fecha_creacion)) <= ?`
      );
      params.push(filtros.fecha_hasta);
    }

    const rows = await queryAsync(
      `SELECT
         TRIM(COALESCE(NULLIF(TRIM(numero_contrato), ''), NULLIF(TRIM(numerodoc_contrato), ''))) AS numero_contrato,
         COALESCE(NULLIF(TRIM(constructora), ''), 'Sin cliente') AS cliente,
         COALESCE(fecha_radicado, fecha_emision, DATE(fecha_creacion)) AS fecha_ref,
         IFNULL(COALESCE(valor_a_pagar, valor_acta), 0) AS valor
       FROM acta_pago
      WHERE ${where.join(' AND ')}`,
      params
    );
    for (const r of rows || []) out.push({ ...r, fuente: 'acta_pago' });
  } catch (e) {
    console.warn('balanceGlobal acta_pago:', e?.message);
  }

  // Legado plano
  try {
    const where = [
      `UPPER(TRIM(COALESCE(NULLIF(TRIM(numero_contrato), ''), NULLIF(TRIM(numerodoc), '')))) IN (${placeholders})`,
    ];
    const params = [...keys.map((k) => k.toUpperCase())];
    if (filtros.fecha_desde) {
      where.push(`DATE(fecha_creacion) >= ?`);
      params.push(filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
      where.push(`DATE(fecha_creacion) <= ?`);
      params.push(filtros.fecha_hasta);
    }

    const rows = await queryAsync(
      `SELECT
         TRIM(COALESCE(NULLIF(TRIM(numero_contrato), ''), NULLIF(TRIM(numerodoc), ''))) AS numero_contrato,
         COALESCE(NULLIF(TRIM(empresa), ''), 'Sin cliente') AS cliente,
         DATE(fecha_creacion) AS fecha_ref,
         IFNULL(COALESCE(vr_total_documento, total_a_pagar), 0) AS valor
       FROM actas_pago_plano
      WHERE ${where.join(' AND ')}`,
      params
    );
    for (const r of rows || []) out.push({ ...r, fuente: 'plano' });
  } catch (e) {
    console.warn('balanceGlobal actas_pago_plano:', e?.message);
  }

  return out;
}

async function fetchAiuForContratos(contratos) {
  const keys = [
    ...new Set(
      (contratos || []).map((c) => String(c || '').trim()).filter(Boolean)
    ),
  ];
  if (!keys.length) return [];

  const placeholders = keys.map(() => '?').join(',');
  const sql = `
    SELECT
      TRIM(it.numdoc) AS numero_contrato,
      COALESCE(NULLIF(TRIM(cat.codigo), ''), NULLIF(TRIM(it.insumo), ''), 'SIN') AS insumo_codigo,
      COALESCE(NULLIF(TRIM(cat.nombre), ''), '') AS insumo_nombre,
      COALESCE(NULLIF(TRIM(cat_c.nombre), ''), 'Otros') AS categoria,
      COALESCE(NULLIF(TRIM(hdr.constructora), ''), 'Sin cliente') AS cliente,
      SUM(it.valor_base) AS valor_base_total,
      SUM(
        it.valor_base * CASE
          WHEN it.porc_ut IS NULL THEN 0
          WHEN ABS(it.porc_ut) > 1 THEN it.porc_ut / 100
          ELSE it.porc_ut
        END
      ) AS utilidad_total
    FROM (
      SELECT TRIM(numdoc) AS numdoc, insumo, valor_base, porc_ut
        FROM aiu
       WHERE TRIM(IFNULL(numdoc, '')) <> ''
         AND valor_base IS NOT NULL AND valor_base > 0
      UNION ALL
      SELECT TRIM(numdoc) AS numdoc, insumo, valor_base, NULL AS porc_ut
        FROM iva_pleno
       WHERE TRIM(IFNULL(numdoc, '')) <> ''
         AND valor_base IS NOT NULL AND valor_base > 0
    ) it
    LEFT JOIN (
      SELECT
        TRIM(numerodoc) AS numerodoc,
        MAX(CASE WHEN nombre_campo_doc = 'empresa' THEN TRIM(valor_campo_doc) END) AS constructora
      FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
      GROUP BY TRIM(numerodoc)
    ) hdr ON hdr.numerodoc = it.numdoc
    LEFT JOIN insumo cat
      ON UPPER(TRIM(cat.codigo)) = UPPER(TRIM(it.insumo))
      OR UPPER(TRIM(cat.nombre)) = UPPER(TRIM(it.insumo))
    LEFT JOIN insumo_categoria cat_c ON cat_c.id_categoria = cat.id_categoria
    WHERE TRIM(it.numdoc) IN (${placeholders})
    GROUP BY
      TRIM(it.numdoc),
      COALESCE(NULLIF(TRIM(cat.codigo), ''), NULLIF(TRIM(it.insumo), ''), 'SIN'),
      COALESCE(NULLIF(TRIM(cat.nombre), ''), ''),
      COALESCE(NULLIF(TRIM(cat_c.nombre), ''), 'Otros'),
      COALESCE(NULLIF(TRIM(hdr.constructora), ''), 'Sin cliente')
  `;
  try {
    return await queryAsync(sql, keys);
  } catch (e) {
    console.warn('balanceGlobal AIU:', e?.message);
    return [];
  }
}

function buildDataset(contratosScoped, actas, aiuRows) {
  const contratosCount = (contratosScoped || []).length;

  const facturado = roundMoney(
    (actas || []).reduce((a, r) => a + toNumber(r.valor), 0)
  );
  const valorContratado = roundMoney(
    (contratosScoped || []).reduce((a, c) => a + toNumber(c.valor_contrato), 0)
  );

  let utilidadAiu = 0;
  let valorBaseAiu = 0;
  for (const r of aiuRows || []) {
    utilidadAiu += toNumber(r.utilidad_total);
    valorBaseAiu += toNumber(r.valor_base_total);
  }
  utilidadAiu = roundMoney(utilidadAiu);
  valorBaseAiu = roundMoney(valorBaseAiu);
  const costoAiu = roundMoney(Math.max(0, valorBaseAiu - utilidadAiu));

  // Ventas del portafolio (global): valor contratado → AIU → facturado.
  // El facturado se reporta aparte (aún hay pocas actas en módulo).
  const ventasTotales =
    valorContratado > 0
      ? valorContratado
      : valorBaseAiu > 0
        ? valorBaseAiu
        : facturado;
  const costoTotal = aiuRows?.length ? costoAiu : 0;
  const gananciaTotal = aiuRows?.length ? utilidadAiu : 0;
  const margen =
    ventasTotales > 0 ? roundPct((gananciaTotal / ventasTotales) * 100) : 0;

  const ratioGan = ventasTotales > 0 ? gananciaTotal / ventasTotales : 0;

  // Evolución mensual por fecha_inicio + valor_contrato (portafolio completo)
  const byMonth = new Map();
  const pushMonth = (dateVal, monto) => {
    const d = dateVal ? new Date(dateVal) : null;
    if (!d || Number.isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prev = byMonth.get(key) || {
      key,
      anio: d.getFullYear(),
      mes: d.getMonth() + 1,
      ventas: 0,
    };
    prev.ventas += toNumber(monto);
    byMonth.set(key, prev);
  };

  for (const c of contratosScoped || []) {
    pushMonth(c.fecha_inicio, c.valor_contrato || 0);
  }
  // Si no hay fechas/valores de contrato, caer a actas
  if (!byMonth.size) {
    for (const r of actas || []) pushMonth(r.fecha_ref, r.valor);
  }

  const evolucion_mensual = Array.from(byMonth.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((m) => {
      const ventas = roundMoney(m.ventas);
      return {
        key: m.key,
        label: `${MONTH_LABELS[m.mes - 1]} ${m.anio}`,
        mes_corto: MONTH_LABELS[m.mes - 1],
        ventas,
        ganancia: roundMoney(ventas * ratioGan),
      };
    });

  // Por cliente: portafolio completo (valor_contrato; si 0 → AIU)
  const byClient = new Map();
  const addClientVentas = (cliente, monto) => {
    const key = String(cliente || 'Sin cliente').trim() || 'Sin cliente';
    const prev = byClient.get(key) || { cliente: key, ventas: 0 };
    prev.ventas += toNumber(monto);
    byClient.set(key, prev);
  };

  for (const c of contratosScoped || []) {
    addClientVentas(c.cliente, c.valor_contrato);
  }
  const sumCli = Array.from(byClient.values()).reduce(
    (a, c) => a + c.ventas,
    0
  );
  if (sumCli <= 0) {
    byClient.clear();
    for (const r of aiuRows || []) {
      addClientVentas(r.cliente, r.valor_base_total);
    }
  }

  const utilidadByClient = new Map();
  for (const r of aiuRows || []) {
    const cliente = String(r.cliente || 'Sin cliente').trim() || 'Sin cliente';
    utilidadByClient.set(
      cliente,
      (utilidadByClient.get(cliente) || 0) + toNumber(r.utilidad_total)
    );
  }

  const clientesSorted = Array.from(byClient.values()).sort(
    (a, b) => b.ventas - a.ventas
  );
  const totalClientesVentas =
    clientesSorted.reduce((a, c) => a + toNumber(c.ventas), 0) || 1;
  const TOP_N = 5;
  const top = clientesSorted.slice(0, TOP_N);
  const resto = clientesSorted.slice(TOP_N);
  const restoVentas = roundMoney(resto.reduce((a, c) => a + c.ventas, 0));

  const ventas_por_cliente = [];
  top.forEach((c, i) => {
    const ventas = roundMoney(c.ventas);
    ventas_por_cliente.push({
      cliente: c.cliente,
      ventas,
      pct: roundPct((ventas / totalClientesVentas) * 100),
      color: CLIENT_COLORS[i % CLIENT_COLORS.length],
    });
  });
  if (restoVentas > 0) {
    ventas_por_cliente.push({
      cliente: 'Otros',
      ventas: restoVentas,
      pct: roundPct((restoVentas / totalClientesVentas) * 100),
      color: CLIENT_COLORS[TOP_N % CLIENT_COLORS.length],
    });
  }

  const rentabilidad_por_cliente = clientesSorted.map((c) => {
    const ventas = roundMoney(c.ventas);
    const ganancia = roundMoney(utilidadByClient.get(c.cliente) || 0);
    const margenCli = ventas > 0 ? roundPct((ganancia / ventas) * 100) : 0;
    return {
      cliente: c.cliente,
      ventas,
      ganancia,
      margen: margenCli,
      barra_pct: Math.max(0, Math.min(100, margenCli)),
      barra_color:
        margenCli >= 20 ? '#43a047' : margenCli >= 10 ? '#ef6c00' : '#c62828',
    };
  });

  // Por insumo / categoría (AIU de todos los contratos del alcance)
  const byInsumo = new Map();
  const byCategoria = new Map();
  for (const r of aiuRows || []) {
    const label = formatInsumoLabel(r.insumo_codigo, r.insumo_nombre);
    const cat = String(r.categoria || 'Otros').trim() || 'Otros';
    const vb = toNumber(r.valor_base_total);
    const ut = toNumber(r.utilidad_total);
    const costo = Math.max(0, vb - ut);

    const prevI = byInsumo.get(label) || {
      insumo: label,
      ventas: 0,
      costo: 0,
      ganancia: 0,
    };
    prevI.ventas += vb;
    prevI.costo += costo;
    prevI.ganancia += ut;
    byInsumo.set(label, prevI);

    const prevC = byCategoria.get(cat) || {
      categoria: cat,
      ventas: 0,
      ganancia: 0,
    };
    prevC.ventas += vb;
    prevC.ganancia += ut;
    byCategoria.set(cat, prevC);
  }

  const por_insumo = Array.from(byInsumo.values())
    .map((r) => {
      const ventas = roundMoney(r.ventas);
      const costo = roundMoney(r.costo);
      const ganancia = roundMoney(r.ganancia);
      return {
        insumo: r.insumo,
        ventas,
        costo,
        ganancia,
        margen: ventas > 0 ? roundPct((ganancia / ventas) * 100) : 0,
      };
    })
    .sort((a, b) => b.ventas - a.ventas);

  const catsSorted = Array.from(byCategoria.values()).sort(
    (a, b) => b.ventas - a.ventas
  );
  const catTop = catsSorted.slice(0, 4);
  const catResto = catsSorted.slice(4);
  const por_categoria_barras = catTop.map((c) => ({
    label: c.categoria,
    ventas: roundMoney(c.ventas),
    ganancia: roundMoney(c.ganancia),
  }));
  if (catResto.length) {
    por_categoria_barras.push({
      label: 'Otros',
      ventas: roundMoney(catResto.reduce((a, c) => a + c.ventas, 0)),
      ganancia: roundMoney(catResto.reduce((a, c) => a + c.ganancia, 0)),
    });
  }

  const totalCatVentas =
    catsSorted.reduce((a, c) => a + toNumber(c.ventas), 0) || 1;
  const elementos_donut = catsSorted.slice(0, 6).map((c, i) => {
    const ventas = roundMoney(c.ventas);
    return {
      label: c.categoria,
      valor: ventas,
      pct: roundPct((ventas / totalCatVentas) * 100),
      color: CLIENT_COLORS[i % CLIENT_COLORS.length],
    };
  });

  const topInsumo = por_insumo[0] || null;
  const insumo_mas_vendido = topInsumo
    ? {
        nombre: shortInsumoName(topInsumo.insumo),
        insumo: topInsumo.insumo,
        pct:
          valorBaseAiu > 0
            ? roundPct((topInsumo.ventas / valorBaseAiu) * 100)
            : 0,
        ventas: topInsumo.ventas,
      }
    : null;

  const avance_total_pct =
    valorBaseAiu > 0
      ? roundPct(Math.min(100, (facturado / valorBaseAiu) * 100))
      : facturado > 0
        ? 100
        : 0;

  const maxMensual = Math.max(
    ...evolucion_mensual.map((m) => Math.max(m.ventas, m.ganancia)),
    1
  );
  const maxCat = Math.max(
    ...por_categoria_barras.map((b) => Math.max(b.ventas, b.ganancia)),
    1
  );

  const ventasFuente =
    valorContratado > 0
      ? 'valor_contrato'
      : valorBaseAiu > 0
        ? 'aiu'
        : 'actas';

  return {
    kpis: {
      ventas_totales: ventasTotales,
      ganancia_total: gananciaTotal,
      margen_utilidad: margen,
      costo_total: costoTotal,
      contratos: contratosCount,
      facturado,
      valor_contratado: valorContratado,
      ventas_fuente: ventasFuente,
    },
    evolucion_mensual: evolucion_mensual.map((m) => ({
      ...m,
      ventas_pct: Math.round((m.ventas / maxMensual) * 100),
      ganancia_pct: Math.round((m.ganancia / maxMensual) * 100),
    })),
    ventas_por_cliente,
    rentabilidad_por_cliente,
    por_insumo: por_insumo.slice(0, 25),
    por_categoria_barras: por_categoria_barras.map((b) => ({
      ...b,
      ventas_pct: Math.round((b.ventas / maxCat) * 100),
      ganancia_pct: Math.round((b.ganancia / maxCat) * 100),
    })),
    elementos_donut,
    avance_total_pct,
    insumo_mas_vendido,
    nota:
      'Ventas = valor contratado del portafolio (EAV). Facturado (actas módulo+legado) se calcula aparte. Ganancia/costo = utilidad AIU. Contratos = todos los del filtro.',
  };
}

async function buildBalanceGlobal(filtros) {
  const contratosScoped = await fetchScopedContratos(filtros);
  const keys = contratosScoped.map((c) => c.numero_contrato);
  const [actas, aiuRows] = await Promise.all([
    fetchActasVentas(keys, filtros),
    fetchAiuForContratos(keys),
  ]);
  const data = buildDataset(contratosScoped, actas, aiuRows);
  return {
    columns: [],
    rows: [],
    meta: {
      reporte: 'Balance global de la empresa',
      titulo: 'INFORME GLOBAL DE LA EMPRESA',
      filtros,
      ...data,
    },
  };
}

const getBalanceGlobalPreview = async (req, res) => {
  try {
    const filtros = buildFilters(req.query || {});
    const payload = await buildBalanceGlobal(filtros);
    return res.status(200).json({
      code: 1,
      message: 'OK',
      data: payload,
    });
  } catch (err) {
    console.error('getBalanceGlobalPreview:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al generar la vista previa del balance global.',
      error: err?.message,
    });
  }
};

const exportBalanceGlobal = async (req, res) => {
  try {
    const filtros = buildFilters(req.query || {});
    const payload = await buildBalanceGlobal(filtros);
    const m = payload.meta || {};
    const k = m.kpis || {};

    const aoa = [
      ['INFORME GLOBAL DE LA EMPRESA'],
      [
        'Rango',
        `${filtros.fecha_desde || '—'} — ${filtros.fecha_hasta || '—'}`,
      ],
      ['Empresa asociada', filtros.empresa_asociada || 'Todas'],
      [],
      ['KPI', 'Valor'],
      ['Ventas totales', k.ventas_totales ?? 0],
      ['Facturado (actas)', k.facturado ?? 0],
      ['Valor contratado', k.valor_contratado ?? 0],
      ['Ganancia total', k.ganancia_total ?? 0],
      ['Margen de utilidad %', k.margen_utilidad ?? 0],
      ['Costo total', k.costo_total ?? 0],
      ['Contratos', k.contratos ?? 0],
      [],
      ['Cliente', 'Ventas', 'Ganancia', 'Margen %'],
    ];
    for (const r of m.rentabilidad_por_cliente || []) {
      aoa.push([r.cliente, r.ventas, r.ganancia, r.margen]);
    }
    aoa.push([]);
    aoa.push(['Insumo', 'Ventas', 'Costo', 'Ganancia', 'Margen %']);
    for (const r of m.por_insumo || []) {
      aoa.push([r.insumo, r.ventas, r.costo, r.ganancia, r.margen]);
    }
    aoa.push([]);
    aoa.push(['Mes', 'Ventas', 'Ganancia']);
    for (const r of m.evolucion_mensual || []) {
      aoa.push([r.label, r.ventas, r.ganancia]);
    }
    if (m.nota) {
      aoa.push([]);
      aoa.push(['Nota', m.nota]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 36 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BALANCE GLOBAL');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=balance-global-empresa-${stamp}.xlsx`
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('exportBalanceGlobal:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al exportar el balance global.',
      error: err?.message,
    });
  }
};

module.exports = {
  getBalanceGlobalPreview,
  exportBalanceGlobal,
};
