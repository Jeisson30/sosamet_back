const XLSX = require('xlsx');
const db = require('../../config/db');

/**
 * Control General Contrato — detalle agrupado por INSUMO.
 * Consume SP_REPORTE_CONTROL_GENERAL_CONTRATO(p_numero_contrato).
 */
function buildProductionByContractDataset(query) {
  const {
    numero_contrato: rawNum,
    documento: rawDoc,
    tipo_corte: rawTipoCorte,
    empresa_asociada: rawEmp,
    tipo_informe: rawTipoInf,
  } = query;

  const columns = [
    { field: 'ref', header: 'REF' },
    { field: 'insumo', header: 'Insumo' },
    { field: 'um', header: 'UM' },
    { field: 'contratado', header: 'Cant' },
    { field: 'fabricado', header: 'Fabricado' },
    { field: 'diff_fabricado', header: 'Dif. fabricado' },
    { field: 'pct_fabricado', header: '% fabricado' },
    { field: 'entregado', header: 'Entregado' },
    { field: 'diff_entregado', header: 'Dif. entregado' },
    { field: 'pct_entregado', header: '% entregado' },
    { field: 'instalado', header: 'Instalado' },
    { field: 'diff_instalado', header: 'Dif. instalado' },
    { field: 'pct_instalado', header: '% instalado' },
    { field: 'facturado', header: 'Facturado' },
    { field: 'pct_facturado', header: '% facturado' },
  ];

  const meta = {
    reporte: 'Control General Contrato',
    tipo_informe:
      rawTipoInf && String(rawTipoInf).trim() !== ''
        ? String(rawTipoInf).trim()
        : 'control-general-contrato',
    numero_contrato:
      rawNum && String(rawNum).trim() !== '' ? String(rawNum).trim() : null,
    documento: rawDoc && String(rawDoc).trim() !== '' ? String(rawDoc) : 'Todos',
    tipo_corte:
      rawTipoCorte && String(rawTipoCorte).trim() !== ''
        ? String(rawTipoCorte)
        : 'Todos',
    empresa_asociada:
      rawEmp && String(rawEmp).trim() !== '' ? String(rawEmp).trim() : null,
    contrato: null,
    resumen: null,
  };

  return { columns, rows: [], meta };
}

function normalizeSpError(err) {
  const msg =
    err && (err.sqlMessage || err.message)
      ? String(err.sqlMessage || err.message)
      : 'Error al ejecutar el procedimiento';
  const isNotFound = /contrato no existe/i.test(msg);
  return { msg, isNotFound };
}

/** Normaliza código de insumo: BR003 y BR03 → BR3 (letra + número sin ceros a la izq.). */
function normalizeInsumoCodeKey(code) {
  const s = String(code ?? '')
    .trim()
    .toUpperCase();
  if (!s) return '';
  const m = s.match(/^([A-Z]+)0*(\d+)$/);
  if (m) return `${m[1]}${Number(m[2])}`;
  return s;
}

function looksLikeInsumoCodigo(value) {
  return /^[A-Z]{1,4}\d{1,4}$/i.test(String(value ?? '').trim());
}

function cleanInsumoNameHint(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+\d+([.,]\d+)?\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Resuelve { codigo, nombre } del catálogo.
 * El SP a veces trae el nombre (BARANDA) en `insumo` en lugar del código (BR01).
 */
function resolveInsumoFromCatalog(catalog, rawInsumo) {
  const raw = String(rawInsumo ?? '').trim();
  if (!raw || !catalog) return { codigo: raw || null, nombre: null };

  const rawUp = raw.toUpperCase();

  if (looksLikeInsumoCodigo(rawUp)) {
    const byCode =
      catalog.byCodigo.get(rawUp) ||
      catalog.byCodigo.get(normalizeInsumoCodeKey(rawUp));
    if (byCode) return { codigo: byCode.codigo, nombre: byCode.nombre };
    return { codigo: rawUp, nombre: null };
  }

  const hint = cleanInsumoNameHint(rawUp);
  if (hint && catalog.byNombre.has(hint)) {
    const hit = catalog.byNombre.get(hint);
    return { codigo: hit.codigo, nombre: hit.nombre };
  }

  if (hint && hint.length >= 3) {
    const partial = catalog.list
      .filter((i) => {
        const n = i.nombreUp;
        return n === hint || n.startsWith(hint) || hint.startsWith(n);
      })
      .sort(
        (a, b) =>
          a.nombre.length - b.nombre.length ||
          a.codigo.localeCompare(b.codigo)
      )[0];
    if (partial) return { codigo: partial.codigo, nombre: partial.nombre };
  }

  return { codigo: rawUp, nombre: null };
}

function mapDetalleInsumo(r, numeroContrato, contrato, catalog) {
  const raw = r.insumo != null ? String(r.insumo).trim() : '';
  const resolved = resolveInsumoFromCatalog(catalog, raw);
  const insumoNombre =
    resolved.nombre ||
    (r.insumo_nombre != null ? String(r.insumo_nombre).trim() : '') ||
    null;

  return {
    numero_contrato: contrato?.numero_contrato ?? numeroContrato,
    ref: r.ref ?? null,
    insumo: resolved.codigo || raw || null,
    insumo_nombre: insumoNombre,
    um: r.um ?? r.UM ?? null,
    contratado: r.contratado ?? null,
    fabricado: r.fabricado ?? 0,
    entregado: r.entregado ?? 0,
    instalado: r.instalado ?? 0,
    facturado: r.facturado ?? 0,
    diff_fabricado: r.diff_fabricado ?? null,
    diff_entregado: r.diff_entregado ?? null,
    diff_instalado: r.diff_instalado ?? null,
    diff_facturado: r.diff_facturado ?? null,
    pct_fabricado: r.pct_fabricado ?? 0,
    pct_entregado: r.pct_entregado ?? 0,
    pct_instalado: r.pct_instalado ?? 0,
    pct_facturado: r.pct_facturado ?? 0,
  };
}

/** Catálogo activo: índices por código y por nombre. */
function loadInsumoNombreByCodigo(cb) {
  db.query(
    `SELECT UPPER(TRIM(codigo)) AS codigo, TRIM(nombre) AS nombre
       FROM insumo
      WHERE UPPER(TRIM(estado)) = 'ACTIVO'`,
    (err, rows) => {
      const byCodigo = new Map();
      const byNombre = new Map();
      const list = [];
      if (!err) {
        for (const row of rows || []) {
          const code = String(row?.codigo ?? '').trim().toUpperCase();
          const nombre = String(row?.nombre ?? '').trim();
          if (!code || !nombre) continue;
          const entry = { codigo: code, nombre, nombreUp: nombre.toUpperCase() };
          list.push(entry);
          byCodigo.set(code, entry);
          const norm = normalizeInsumoCodeKey(code);
          if (norm && !byCodigo.has(norm)) byCodigo.set(norm, entry);
          const nombreUp = entry.nombreUp;
          if (!byNombre.has(nombreUp)) byNombre.set(nombreUp, entry);
        }
      }
      return cb({ byCodigo, byNombre, list });
    }
  );
}

function callReporteContrato(numeroContrato, cb) {
  db.query(
    'CALL SP_REPORTE_CONTROL_GENERAL_CONTRATO(?)',
    [numeroContrato],
    (err, results) => {
      if (err) return cb(err);

      const contratoRows = Array.isArray(results?.[0]) ? results[0] : [];
      const detalleRows = Array.isArray(results?.[1]) ? results[1] : [];
      const resumenRows = Array.isArray(results?.[2]) ? results[2] : [];

      return cb(null, {
        contrato: contratoRows?.[0] ?? null,
        detalle: detalleRows ?? [],
        resumen: resumenRows?.[0] ?? null,
      });
    }
  );
}

function normalizeCarteraSpRow(r) {
  if (!r || typeof r !== 'object') return null;
  return {
    constructora: r.constructora ?? null,
    proyecto: r.proyecto ?? null,
    contrato: r.contrato ?? null,
    rete_garantia: r.rete_garantia ?? null,
    saldo_contrato: r.saldo_contrato ?? null,
    ultimo_corte: r.ultimo_corte ?? null,
    documento: r.documento ?? null,
    valor: r.valor ?? null,
    saldo: r.saldo ?? null,
    dias: r.dias ?? null,
    tipo_bloque: r.tipo_bloque ?? null,
  };
}

/**
 * SP_REPORTE_CARTERA devuelve un único result set: filas RETE | FACT | TOTAL_CONSTRUCTORA.
 */
function buildCarteraGrupos(rawRows) {
  const rows = (rawRows || [])
    .map(normalizeCarteraSpRow)
    .filter(Boolean);
  const byCons = new Map();
  for (const r of rows) {
    const key = String(r.constructora ?? '').trim() || '(Sin constructora)';
    if (!byCons.has(key)) {
      byCons.set(key, {
        constructora: key,
        rete: [],
        facturacion: [],
        total_constructora: null,
      });
    }
    const g = byCons.get(key);
    const tipo = String(r.tipo_bloque ?? '').toUpperCase();
    if (tipo === 'RETE') g.rete.push(r);
    else if (tipo === 'FACT') g.facturacion.push(r);
    else if (tipo === 'TOTAL_CONSTRUCTORA') g.total_constructora = r;
  }
  return Array.from(byCons.values()).sort((a, b) =>
    a.constructora.localeCompare(b.constructora, 'es', { sensitivity: 'base' })
  );
}

/** Saldo / rete por un contrato (obras activas y compatibilidad). */
function buildLegacyCarteraFromRaw(rawRows, numeroContrato) {
  const num = numeroContrato ? String(numeroContrato).trim() : '';
  const rows = (rawRows || [])
    .map(normalizeCarteraSpRow)
    .filter(Boolean);
  let reteRows = rows.filter(
    (r) => String(r.tipo_bloque ?? '').toUpperCase() === 'RETE'
  );
  if (num) {
    reteRows = reteRows.filter((r) => String(r.contrato ?? '').trim() === num);
  }
  const row = reteRows[0] ?? null;

  let factRows = rows.filter(
    (r) => String(r.tipo_bloque ?? '').toUpperCase() === 'FACT'
  );
  if (num) {
    factRows = factRows.filter((r) => String(r.contrato ?? '').trim() === num);
  }

  const encabezado = row
    ? {
        empresa: row.constructora,
        proyecto: row.proyecto,
        numero_contrato: row.contrato,
        dias: row.dias,
      }
    : null;

  const resumen = row
    ? {
        rete_garantia: row.rete_garantia,
        saldo_contrato: row.saldo_contrato,
        ultimo_corte: row.ultimo_corte,
      }
    : null;

  const facturacion = factRows.map((r) => ({
    proyecto: r.proyecto ?? null,
    numero_contrato: r.contrato ?? null,
    no_documento: r.documento ?? null,
    valor: r.valor ?? null,
    saldo: r.saldo ?? null,
    estado: r.dias != null && r.dias !== '' ? String(r.dias) : null,
  }));

  return {
    encabezado,
    resumen,
    facturacion,
    obras_activas: [],
  };
}

function callReporteCartera(opts, cb) {
  const numero =
    opts?.numero_contrato && String(opts.numero_contrato).trim() !== ''
      ? String(opts.numero_contrato).trim()
      : null;
  const empresaAsoc =
    opts?.empresa_asociada != null && String(opts.empresa_asociada).trim() !== ''
      ? String(opts.empresa_asociada).trim()
      : null;
  const fechaDesde =
    opts?.fecha_desde && String(opts.fecha_desde).trim() !== ''
      ? String(opts.fecha_desde).trim()
      : null;
  const fechaHasta =
    opts?.fecha_hasta && String(opts.fecha_hasta).trim() !== ''
      ? String(opts.fecha_hasta).trim()
      : null;
  const constructora =
    opts?.constructora != null && String(opts.constructora).trim() !== ''
      ? String(opts.constructora).trim()
      : null;
  const proyecto =
    opts?.proyecto != null && String(opts.proyecto).trim() !== ''
      ? String(opts.proyecto).trim()
      : null;

  db.query(
    'CALL SP_REPORTE_CARTERA(?, ?, ?, ?, ?, ?)',
    [numero, empresaAsoc, fechaDesde, fechaHasta, constructora, proyecto],
    (err, results) => {
      if (err) return cb(err);

      const rawRows = Array.isArray(results?.[0]) ? results[0] : [];
      const grupos = buildCarteraGrupos(rawRows);
      const legacy = buildLegacyCarteraFromRaw(rawRows, numero);

      return cb(null, {
        raw: rawRows,
        grupos,
        ...legacy,
      });
    }
  );
}

function callConsultarContratosFull(params, cb) {
  // Forzar collation en parámetros texto para evitar:
  // "Illegal mix of collations ... for operation 'like'"
  // (la BD usa utf8mb4_general_ci en varias tablas/SP).
  const q = `
    CALL SP_ConsultarContratosFull(
      CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci,
      CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci,
      CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci,
      CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci,
      CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci,
      CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci,
      CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci
    )
  `;
  db.query(q, params, (err, results) => {
    if (err) return cb(err);
    const rows = results && results[0] ? results[0] : [];
    return cb(null, rows);
  });
}

function callReporteCarteraAsync(numeroContrato) {
  return new Promise((resolve, reject) => {
    callReporteCartera(
      { numero_contrato: numeroContrato },
      (err, data) => {
        if (err) return reject(err);
        return resolve(data);
      }
    );
  });
}

function callConsultarContratosFullAsync(params) {
  return new Promise((resolve, reject) => {
    callConsultarContratosFull(params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows);
    });
  });
}

/** % entrega global (remisiones / contratado) — mismo resumen de Control General. */
function callPctEntregadoAsync(numeroContrato) {
  return new Promise((resolve) => {
    callReporteContrato(numeroContrato, (err, data) => {
      if (err || !data?.resumen) return resolve(null);
      const n = Number(data.resumen.pct_entregado);
      return resolve(Number.isFinite(n) ? n : null);
    });
  });
}

const getProductionByContractPreview = (req, res) => {
  try {
    const { columns, rows, meta } = buildProductionByContractDataset(req.query);
    const numeroContrato = req.query?.numero_contrato
      ? String(req.query.numero_contrato).trim()
      : '';

    if (!numeroContrato) {
      return res.status(200).json({
        code: 1,
        message: 'Vista previa. Ingrese N° contrato para cargar datos.',
        data: { columns, rows, meta },
      });
    }

    return callReporteContrato(numeroContrato, (spErr, data) => {
      if (spErr) {
        const { msg, isNotFound } = normalizeSpError(spErr);
        return res.status(isNotFound ? 400 : 500).json({
          code: 0,
          message: msg,
        });
      }

      return loadInsumoNombreByCodigo((nombreMap) => {
        const mappedRows = (data.detalle || []).map((r) =>
          mapDetalleInsumo(r, numeroContrato, data.contrato, nombreMap)
        );

        const pctEntregado = Number(data.resumen?.pct_entregado);
        const pctPendiente = Number.isFinite(pctEntregado)
          ? Math.max(0, Math.min(100, Math.round(100 - pctEntregado)))
          : data.resumen?.pct_pendiente ?? null;

        return res.status(200).json({
          code: 1,
          message: 'OK',
          data: {
            columns,
            rows: mappedRows,
            meta: {
              ...meta,
              contrato: data.contrato,
              resumen: data.resumen
                ? { ...data.resumen, pct_pendiente: pctPendiente }
                : null,
            },
          },
        });
      });
    });
  } catch (err) {
    return res.status(500).json({
      code: 0,
      message: 'Error al generar la vista previa del informe.',
      error: err?.message,
    });
  }
};

const getCarteraPreview = (req, res) => {
  try {
    const numeroContrato = req.query?.numero_contrato
      ? String(req.query.numero_contrato).trim()
      : '';
    const empresaAsociada = req.query?.empresa_asociada
      ? String(req.query.empresa_asociada).trim()
      : '';
    const fechaDesde = req.query?.fecha_desde
      ? String(req.query.fecha_desde).trim()
      : '';
    const fechaHasta = req.query?.fecha_hasta
      ? String(req.query.fecha_hasta).trim()
      : '';
    const constructora = req.query?.constructora
      ? String(req.query.constructora).trim()
      : '';
    const proyecto = req.query?.proyecto ? String(req.query.proyecto).trim() : '';

    const opts = {
      numero_contrato: numeroContrato || null,
      empresa_asociada: empresaAsociada || null,
      fecha_desde: fechaDesde || null,
      fecha_hasta: fechaHasta || null,
      constructora: constructora || null,
      proyecto: proyecto || null,
    };

    return callReporteCartera(opts, (spErr, data) => {
      if (spErr) {
        const { msg, isNotFound } = normalizeSpError(spErr);
        return res.status(isNotFound ? 400 : 500).json({
          code: 0,
          message: msg,
        });
      }

      const flatFact = (data.grupos || []).flatMap((g) =>
        (g.facturacion || []).map((r) => ({
          constructora: g.constructora,
          proyecto: r.proyecto,
          numero_contrato: r.contrato,
          no_documento: r.documento,
          valor: r.valor,
          saldo: r.saldo,
          estado: r.dias != null && r.dias !== '' ? String(r.dias) : null,
        }))
      );

      const columns = [
        { field: 'constructora', header: 'Constructora' },
        { field: 'proyecto', header: 'Proyecto' },
        { field: 'numero_contrato', header: 'No. contrato' },
        { field: 'no_documento', header: 'No. documento' },
        { field: 'valor', header: 'Valor' },
        { field: 'saldo', header: 'Saldo' },
        { field: 'estado', header: 'Días' },
      ];

      return res.status(200).json({
        code: 1,
        message: 'OK',
        data: {
          columns,
          rows: flatFact,
          meta: {
            reporte: 'Cartera',
            filtros: opts,
            grupos: data.grupos || [],
            encabezado: data.encabezado,
            resumen: data.resumen,
            facturacion: data.facturacion || [],
          },
        },
      });
    });
  } catch (err) {
    return res.status(500).json({
      code: 0,
      message: 'Error al generar la vista previa del informe de cartera.',
      error: err?.message,
    });
  }
};

const getObrasActivasPreview = async (req, res) => {
  try {
    // Resumen: contratos ACTIVO (empresa 1 y/o 2 según filtro),
    // saldo vía SP_REPORTE_CARTERA y % ejecutado = pct_entregado de Control General.
    const buscar = req.query?.buscar ? String(req.query.buscar).trim() : null;
    const empresaFiltro = req.query?.empresa_asociada
      ? String(req.query.empresa_asociada).trim()
      : null;
    const constructora = req.query?.constructora
      ? String(req.query.constructora).trim()
      : null;
    const proyecto = req.query?.proyecto ? String(req.query.proyecto).trim() : null;

    const columns = [
      { field: 'proyecto', header: 'Proyecto' },
      { field: 'numero_contrato', header: 'No. contrato' },
      { field: 'tipo', header: 'Tipo' },
      { field: 'objeto', header: 'Objeto' },
      { field: 'fecha_inicio', header: 'Fecha inicio' },
      { field: 'fecha_finalizacion', header: 'Fecha finalización' },
      { field: 'valor_contratado', header: 'Valor contratado' },
      { field: 'ejecutado', header: 'Ejecutado' },
      { field: 'saldo', header: 'Saldo' },
      { field: 'constructora', header: 'Constructora' },
      { field: 'empresa_asociada', header: 'Empresa asociada' },
    ];

    const empresas =
      empresaFiltro === '1' || empresaFiltro === '2'
        ? [empresaFiltro]
        : ['1', '2'];

    const baseParams = [
      buscar && buscar !== '' ? buscar : null,
      'ACTIVO',
      null,
      null,
      null, // empresa_asociada (lo seteamos por empresa)
      constructora && constructora !== '' ? constructora : null,
      proyecto && proyecto !== '' ? proyecto : null,
    ];

    const empResults = await Promise.all(
      empresas.map((emp) =>
        callConsultarContratosFullAsync([
          ...baseParams.slice(0, 4),
          emp,
          baseParams[5],
          baseParams[6],
        ])
      )
    );

    const all = empResults.flatMap((rows) => rows || []);

    // Dedupe por numero_contrato (un contrato puede salir repetido por detalle).
    const byContrato = new Map();
    for (const r of all) {
      const num = r?.numero_contrato ? String(r.numero_contrato).trim() : '';
      if (!num) continue;
      if (!byContrato.has(num)) byContrato.set(num, r);
    }

    // Para cada contrato: saldo (cartera) + % ejecutado (entrega remisiones).
    const contratos = Array.from(byContrato.values());
    const carteraMap = new Map();
    const ejecutadoMap = new Map();
    await Promise.all(
      contratos.map(async (c) => {
        const num = String(c.numero_contrato).trim();
        try {
          const data = await callReporteCarteraAsync(num);
          carteraMap.set(num, data);
        } catch (e) {
          // Si falla un contrato, no tumbar todo el reporte.
          carteraMap.set(num, null);
        }
        const pct = await callPctEntregadoAsync(num);
        ejecutadoMap.set(num, pct);
      })
    );

    const rows = contratos.map((c) => {
      const num = String(c.numero_contrato).trim();
      const cartera = carteraMap.get(num);
      const encabezado = cartera?.encabezado ?? null;
      const resumen = cartera?.resumen ?? null;

      return {
        proyecto: c.proyecto ?? encabezado?.proyecto ?? null,
        numero_contrato: num,
        tipo: c.tipo_contrato ?? null,
        objeto: c.descripcion ?? null,
        fecha_inicio: c.fecha_inicio ?? null,
        fecha_finalizacion: c.fecha_fin ?? null,
        valor_contratado: c.valor_contrato ?? resumen?.valor_contrato ?? null,
        ejecutado: ejecutadoMap.get(num) ?? null,
        saldo: resumen?.saldo_contrato ?? null,
        constructora: c.empresa ?? encabezado?.empresa ?? null,
        empresa_asociada: c.empresa_asociada ?? null,
      };
    });

    return res.status(200).json({
      code: 1,
      message: 'OK',
      data: {
        columns,
        rows,
        meta: {
          reporte: 'Obras activas',
          estado: 'ACTIVO',
          empresas,
          empresa_asociada: empresaFiltro || null,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      code: 0,
      message: 'Error al generar la vista previa del informe de obras activas.',
      error: err?.message,
    });
  }
};

const exportProductionByContract = (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (format !== 'xlsx') {
    return res.status(400).json({ code: 0, message: 'Formato no soportado.' });
  }

  const numeroContrato = req.query?.numero_contrato
    ? String(req.query.numero_contrato).trim()
    : '';

  if (!numeroContrato) {
    return res.status(400).json({
      code: 0,
      message: 'numero_contrato es obligatorio para exportar.',
    });
  }

  const { columns } = buildProductionByContractDataset(req.query);

  return callReporteContrato(numeroContrato, (spErr, data) => {
    if (spErr) {
      const { msg, isNotFound } = normalizeSpError(spErr);
      return res.status(isNotFound ? 400 : 500).json({
        code: 0,
        message: msg,
      });
    }

    return loadInsumoNombreByCodigo((nombreMap) => {
      try {
        const headers = columns.map((c) => c.header);
        const aoa = [headers];

        (data.detalle || []).forEach((row) => {
          const rowObj = mapDetalleInsumo(
            row,
            numeroContrato,
            data.contrato,
            nombreMap
          );
          const display = { ...rowObj };
          if (display.insumo && display.insumo_nombre) {
            display.insumo = `${display.insumo} - ${display.insumo_nombre}`;
          }
          aoa.push(columns.map((c) => display[c.field] ?? ''));
        });

        aoa.push([]);
        aoa.push(['Contrato', data.contrato?.numero_contrato ?? numeroContrato]);
        if (data.contrato) {
          aoa.push(['Empresa', data.contrato.empresa ?? '']);
          aoa.push(['Empresa asociada', data.contrato.empresa_asociada ?? '']);
          aoa.push(['Proyecto', data.contrato.proyecto ?? '']);
          aoa.push(['Ciudad', data.contrato.ciudad ?? '']);
          aoa.push(['Tipo contrato', data.contrato.tipo_contrato ?? '']);
          aoa.push(['Descripción', data.contrato.descripcion ?? '']);
          aoa.push(['Fecha inicio', data.contrato.fecha_inicio ?? '']);
          aoa.push(['Fecha fin', data.contrato.fecha_fin ?? '']);
        }
        if (data.resumen) {
          const pctEnt = Number(data.resumen.pct_entregado);
          const pctPend = Number.isFinite(pctEnt)
            ? Math.max(0, Math.min(100, Math.round(100 - pctEnt)))
            : data.resumen.pct_pendiente ?? '';
          aoa.push([]);
          aoa.push(['Resumen general', '']);
          aoa.push(['Total contratado', data.resumen.total_contratado ?? '']);
          aoa.push(['Total fabricado', data.resumen.total_fabricado ?? '']);
          aoa.push(['Total entregado', data.resumen.total_entregado ?? '']);
          aoa.push(['Total instalado', data.resumen.total_instalado ?? '']);
          aoa.push(['Total facturado', data.resumen.total_facturado ?? 0]);
          aoa.push(['% fabricado', data.resumen.pct_fabricado ?? '']);
          aoa.push(['% entregado', data.resumen.pct_entregado ?? '']);
          aoa.push(['% instalado', data.resumen.pct_instalado ?? '']);
          aoa.push(['% facturado', data.resumen.pct_facturado ?? 0]);
          aoa.push(['% pendiente', pctPend]);
        }

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Control General');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader(
          'Content-Disposition',
          `attachment; filename=informe-control-general-contrato-${numeroContrato}.xlsx`
        );
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        return res.status(200).send(buffer);
      } catch (err) {
        return res.status(500).json({
          code: 0,
          message: 'Error al generar el archivo Excel.',
          error: err?.message,
        });
      }
    });
  });
};

/* ===================== MOVIMIENTOS GENERALES ===================== */

const MOVIMIENTO_REMISIONES_COLUMNS = [
  { field: 'fecha', header: 'FECHA' },
  { field: 'tipo_doc', header: 'TIPO DOC.' },
  { field: 'empresa_asociada', header: 'EMPRESA ASOCIADA' },
  { field: 'consecutivo', header: 'CONSECUTIVO' },
  { field: 'constructora', header: 'CONSTRUCTORA' },
  { field: 'proyecto', header: 'PROYECTO' },
  { field: 'tipo_contractual', header: 'TIPO CONTRACTUAL' },
  { field: 'no_documento', header: 'No. DOCUMENTO' },
  { field: 'insumo', header: 'INSUMO' },
  { field: 'item', header: 'ITEM' },
  { field: 'detalle', header: 'DETALLE' },
  { field: 'cantidad', header: 'CANTIDAD' },
  { field: 'um', header: 'UM' },
  { field: 'observaciones', header: 'OBSERVACIONES' },
  { field: 'despacho', header: 'DESPACHO' },
  { field: 'transporto', header: 'TRANSPORTO' },
  { field: 'usuario', header: 'USUARIO' },
  { field: 'estado', header: 'ESTADO' },
];

const MOVIMIENTO_ACTAS_MEDIDA_COLUMNS = [
  { field: 'fecha_creacion', header: 'FECHA CREACION' },
  { field: 'tipo_doc', header: 'TIPO DOC.' },
  { field: 'empresa_asociada', header: 'EMPRESA ASOCIADA' },
  { field: 'consecutivo', header: 'CONSECUTIVO' },
  { field: 'constructora', header: 'CONSTRUCTORA' },
  { field: 'proyecto', header: 'PROYECTO' },
  { field: 'tipo_contractual', header: 'TIPO CONTRACTUAL' },
  { field: 'no_documento', header: 'No. DOCUMENTO' },
  { field: 'fecha_acta', header: 'FECHA ACTA' },
  { field: 'disenador', header: 'DISEÑADOR ENCARGADO' },
  { field: 'entrega_plano', header: 'ENTREGA PLANO' },
  { field: 'insumo', header: 'INSUMO' },
  { field: 'item', header: 'ITEM' },
  { field: 'detalle', header: 'DETALLE' },
  { field: 'cantidad', header: 'CANTIDAD' },
  { field: 'um', header: 'UM' },
  { field: 'ancho', header: 'ANCHO' },
  { field: 'alto', header: 'ALTO' },
  { field: 'fondo', header: 'FONDO' },
  { field: 'observaciones', header: 'OBSERVACIONES' },
  { field: 'usuario', header: 'USUARIO' },
  { field: 'estado', header: 'ESTADO' },
];

const MOVIMIENTO_CONTRATOS_COLUMNS = [
  { field: 'fecha_creacion', header: 'FECHA CREACIÓN' },
  { field: 'tipo_doc', header: 'TIPO DOC.' },
  { field: 'tipo_contractual', header: 'TIPO CONTRACTUAL' },
  { field: 'no_documento', header: 'No. DOCUMENTO' },
  { field: 'tipo_contrato', header: 'TIPO DE CONTRATO' },
  { field: 'constructora', header: 'CONSTRUCTORA' },
  { field: 'proyecto', header: 'PROYECTO' },
  { field: 'estado', header: 'ESTADO' },
  { field: 'empresa_asociada', header: 'EMPRESA ASOCIADA' },
  { field: 'fecha_inicio', header: 'FECHA INICIO' },
  { field: 'fecha_fin', header: 'FECHA FIN' },
  { field: 'encargado', header: 'ENCARGADO' },
  { field: 'ciudad', header: 'CIUDAD' },
  { field: 'ref', header: 'REF.' },
  { field: 'insumo', header: 'INSUMO' },
  { field: 'item', header: 'ITEM' },
  { field: 'detalle', header: 'DETALLE' },
  { field: 'cant', header: 'CANT' },
  { field: 'um', header: 'UM' },
  { field: 'ancho', header: 'ANCHO' },
  { field: 'alto', header: 'ALTO' },
  { field: 'valor_base', header: 'VALOR BASE' },
  { field: 'porc_adm', header: '% ADM' },
  { field: 'vr_adm', header: 'VR ADM' },
  { field: 'porc_imp', header: '% IMP' },
  { field: 'vr_imp', header: 'VR IMP' },
  { field: 'porc_ut', header: '% UT' },
  { field: 'vr_ut', header: 'VR UT' },
  { field: 'porc_iva', header: '% IVA' },
  { field: 'vr_iva', header: 'VR IVA' },
  { field: 'vr_total', header: 'VR. TOTAL' },
  { field: 'usuario', header: 'USUARIO' },
];

const MOVIMIENTO_HISTORIAL_CONTRATOS_COLUMNS = [
  { field: 'constructora', header: 'CONSTRUCTORA' },
  { field: 'proyecto', header: 'PROYECTO' },
  { field: 'tipo_contractual', header: 'TIPO CONTRACTUAL' },
  { field: 'no_documento', header: 'No. DOCUMENTO' },
  { field: 'tipo', header: 'TIPO' },
  { field: 'descripcion', header: 'DESCRIPCIÓN' },
  { field: 'estado', header: 'ESTADO' },
  { field: 'empresa_asociada', header: 'EMPRESA ASOCIADA' },
  { field: 'fecha_inicio', header: 'FECHA INICIO' },
  { field: 'fecha_fin', header: 'FECHA FIN' },
  { field: 'ciudad', header: 'CIUDAD PROYECTO' },
  { field: 'valor_contrato', header: 'VALOR CONTRATO' },
  { field: 'anticipo', header: 'ANTICIPO' },
  { field: 'saldo', header: 'SALDO' },
  { field: 'encargado', header: 'ENCARGADO' },
  { field: 'usuario', header: 'USUARIO' },
];

/** Valores de tipo_contrato que el legado guardó en tipo_doc_catalogo. */
const TIPO_CONTRATO_SERVICIO = /^(suministro|instalaci[oó]n|suministro e instalaci[oó]n)$/i;

const TIPO_CONTRACTUAL_LABELS = {
  CONTRATO: 'Contrato',
  COTIZACION: 'Cotización',
  OFERTAM: 'Oferta Mercantil',
  ORDENDC: 'Orden De Compra',
  ORDENDT: 'Orden De Trabajo',
  OTRO: 'Otro',
};

function normalizeDocumentoKey(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function cleanParam(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function formatFechaDMY(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${value.getFullYear()}`;
  }
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : String(value);
}

function toCantidad(value) {
  const s = String(value ?? '').trim();
  if (/^-?\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  return s;
}

function loadEmpresasNombreMap(cb) {
  db.query('CALL sp_consultar_empresas()', (err, results) => {
    const map = new Map();
    if (!err) {
      for (const e of (results && results[0]) || []) {
        if (e?.id != null) map.set(String(e.id), String(e.nombre_empresa ?? '').trim());
      }
    }
    return cb(map);
  });
}

/** "código - nombre" del catálogo; si no hay insumo, el detalle del ítem. */
function insumoConRespaldo(catalog, insumoRef, detalle) {
  const raw = insumoRef != null ? String(insumoRef).trim() : '';
  if (raw) {
    const resolved = resolveInsumoFromCatalog(catalog, raw);
    const label = resolved.nombre
      ? `${resolved.codigo} - ${resolved.nombre}`
      : resolved.codigo || raw;
    if (label) return label;
  }
  return detalle != null ? String(detalle).trim() : '';
}

function labelTipoContractual(value) {
  const key = String(value ?? '').trim().toUpperCase();
  return TIPO_CONTRACTUAL_LABELS[key] || value || '';
}

function mapMovimientoRemisionRow(r, catalog, empresas) {
  const insumo = insumoConRespaldo(catalog, r.insumo_ref, r.detalle);
  const empId = r.empresa_asociada != null ? String(r.empresa_asociada).trim() : '';

  return {
    id: r.id,
    numerodoc: r.numerodoc ?? r.plano_numerodoc ?? null,
    fecha: formatFechaDMY(r.fecha),
    tipo_doc: 'REMISIÓN',
    empresa_asociada: empresas.get(empId) || empId,
    consecutivo: r.consecutivo ?? '',
    constructora: r.constructora ?? '',
    proyecto: r.proyecto ?? '',
    tipo_contractual: labelTipoContractual(r.tipo_contrato),
    no_documento: r.no_documento ?? '',
    numero_contrato: r.numero_contrato ?? '',
    insumo,
    item: r.item ?? '',
    detalle: r.detalle ?? '',
    cantidad: toCantidad(r.cantidad),
    um: r.um ?? '',
    observaciones: r.observaciones ?? '',
    despacho: r.despacho ?? '',
    transporto: r.transporto ?? '',
    usuario: r.usuario ?? '',
    estado: r.estado ?? 'Activo',
  };
}

function mapMovimientoActaMedidaRow(r, catalog, empresas) {
  const empId = r.empresa_asociada != null ? String(r.empresa_asociada).trim() : '';

  return {
    id: r.id,
    numerodoc: r.consecutivo ?? null,
    fecha_creacion: formatFechaDMY(r.fecha_creacion),
    tipo_doc: 'ACTA DE MEDIDA',
    empresa_asociada: empId ? empresas.get(empId) || empId : 'NO ASOCIADA',
    consecutivo: r.consecutivo ?? '',
    constructora: r.constructora ?? '',
    proyecto: r.proyecto ?? '',
    tipo_contractual: labelTipoContractual(r.tipo_contrato),
    no_documento: r.no_documento ?? '',
    fecha_acta: formatFechaDMY(r.fecha_acta),
    disenador: r.disenador ?? '',
    entrega_plano: formatFechaDMY(r.entrega_plano),
    insumo: insumoConRespaldo(catalog, r.insumo_ref, r.detalle),
    item: r.item ?? '',
    detalle: r.detalle ?? '',
    cantidad: toCantidad(r.cantidad),
    um: r.um ?? '',
    ancho: toCantidad(r.ancho),
    alto: toCantidad(r.alto),
    fondo: toCantidad(r.fondo),
    observaciones: r.observaciones ?? '',
    usuario: r.usuario ?? '',
    estado: r.estado ?? '',
  };
}

/** Porcentaje guardado como fracción (0.19) → 19; si ya viene en escala 0-100 se deja. */
function toPorcentaje(value) {
  const n = toCantidad(value);
  if (typeof n !== 'number') return n;
  return Math.abs(n) <= 1 ? Math.round(n * 10000) / 100 : n;
}

/** Texto del plano: el legado guardó la cadena "null"/"NULL" en celdas vacías. */
function textoPlano(value) {
  const s = value != null ? String(value).trim() : '';
  return s.toLowerCase() === 'null' ? '' : s;
}

function tipoContractualContrato(catalogo, docContratista) {
  if (catalogo && !TIPO_CONTRATO_SERVICIO.test(catalogo)) return catalogo;
  const vinculo = normalizeDocumentoKey(docContratista);
  return TIPO_CONTRACTUAL_LABELS[vinculo] ? vinculo : 'Contrato';
}

function mapMovimientoContratoRow(r, catalog, empresas) {
  const empId = r.empresa_asociada != null ? String(r.empresa_asociada).trim() : '';
  const catalogo = String(r.tipo_doc_catalogo ?? '').trim();
  const catalogoEsServicio = TIPO_CONTRATO_SERVICIO.test(catalogo);
  const tipoContrato = String(r.tipo_contrato ?? '').trim();
  const detalle = textoPlano(r.detalle);
  const tieneItem = !!r.origen;

  return {
    id: r.origen ? `${r.origen}-${r.item_id}` : r.numerodoc,
    numerodoc: r.numerodoc ?? null,
    fecha_creacion: formatFechaDMY(r.fecha_creacion),
    tipo_doc: 'CONTRATO',
    tipo_contractual: labelTipoContractual(
      tipoContractualContrato(catalogo, r.tipo_doc_contratista)
    ),
    no_documento: r.no_documento ?? '',
    tipo_contrato: tipoContrato || (catalogoEsServicio ? catalogo : ''),
    constructora: r.constructora ?? '',
    proyecto: r.proyecto ?? '',
    estado: r.estado ?? 'Activo',
    empresa_asociada: empId ? empresas.get(empId) || empId : 'NO ASOCIADA',
    fecha_inicio: formatFechaDMY(r.fecha_inicio),
    fecha_fin: formatFechaDMY(r.fecha_fin),
    encargado: r.encargado ?? '',
    ciudad: r.ciudad ?? '',
    ref: textoPlano(r.ref),
    insumo: tieneItem ? insumoConRespaldo(catalog, textoPlano(r.insumo_ref), detalle) : '',
    item: textoPlano(r.item),
    detalle,
    cant: toCantidad(r.cant),
    um: textoPlano(r.um),
    ancho: toCantidad(r.ancho),
    alto: toCantidad(r.alto),
    valor_base: toCantidad(r.valor_base),
    porc_adm: toPorcentaje(r.porc_adm),
    vr_adm: toCantidad(r.vr_adm),
    porc_imp: toPorcentaje(r.porc_imp),
    vr_imp: toCantidad(r.vr_imp),
    porc_ut: toPorcentaje(r.porc_ut),
    vr_ut: toCantidad(r.vr_ut),
    porc_iva: toPorcentaje(r.porc_iva),
    vr_iva: toCantidad(r.vr_iva),
    vr_total: toCantidad(r.vr_total),
    usuario: r.usuario ?? '',
  };
}

/**
 * Monto digitado en el formulario ("100000000", "$ 100.000.000", "1.031.130,50") → número.
 * Vacío o no numérico → null.
 */
function parseMoneda(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    const dec = lastComma > lastDot ? ',' : '.';
    const miles = dec === ',' ? '.' : ',';
    s = s.split(miles).join('').replace(dec, '.');
  } else if (lastComma > -1 || lastDot > -1) {
    const sep = lastComma > -1 ? ',' : '.';
    const partes = s.split(sep);
    const esMiles = partes.length > 2 || partes[partes.length - 1].length === 3;
    s = esMiles ? partes.join('') : partes.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mapMovimientoHistorialContratoRow(r, _catalog, empresas) {
  const empId = r.empresa_asociada != null ? String(r.empresa_asociada).trim() : '';
  const catalogo = String(r.tipo_doc_catalogo ?? '').trim();
  const tipoContrato = String(r.tipo_contrato ?? '').trim();
  const valorDigitado = parseMoneda(r.valor_contrato_txt);
  const valorContrato = valorDigitado ?? parseMoneda(r.total_items);
  const facturado = parseMoneda(r.total_facturado) ?? 0;
  const saldo =
    valorContrato != null ? Math.round((valorContrato - facturado) * 100) / 100 : '';

  return {
    id: r.numerodoc,
    numerodoc: r.numerodoc ?? null,
    constructora: r.constructora ?? '',
    proyecto: r.proyecto ?? '',
    tipo_contractual: labelTipoContractual(
      tipoContractualContrato(catalogo, r.tipo_doc_contratista)
    ),
    no_documento: r.no_documento ?? '',
    tipo: tipoContrato || (TIPO_CONTRATO_SERVICIO.test(catalogo) ? catalogo : ''),
    descripcion: r.descripcion ?? '',
    estado: r.estado ?? 'Activo',
    empresa_asociada: empId ? empresas.get(empId) || empId : 'NO ASOCIADA',
    fecha_inicio: formatFechaDMY(r.fecha_inicio),
    fecha_fin: formatFechaDMY(r.fecha_fin),
    ciudad: r.ciudad ?? '',
    valor_contrato: valorContrato ?? '',
    anticipo: parseMoneda(r.anticipo_txt) ?? '',
    saldo,
    encargado: r.encargado ?? '',
    usuario: r.usuario ?? '',
  };
}

/** Documentos de Movimientos Generales con informe implementado (clave = Documento normalizado). */
const MOVIMIENTO_DOCUMENTOS = {
  CONTRATO: {
    nombre: 'Movimiento Contratos',
    hoja: 'CONTRATO',
    archivo: 'movimiento-contratos',
    sp: 'SP_REPORTE_MOVIMIENTO_CONTRATOS',
    columns: MOVIMIENTO_CONTRATOS_COLUMNS,
    mapRow: mapMovimientoContratoRow,
  },
  'HISTORIAL CONTRATOS': {
    nombre: 'Movimiento Historial Contratos',
    hoja: 'HISTORIAL CONTRATOS',
    archivo: 'movimiento-historial-contratos',
    sp: 'SP_REPORTE_MOVIMIENTO_HISTORIAL_CONTRATOS',
    columns: MOVIMIENTO_HISTORIAL_CONTRATOS_COLUMNS,
    mapRow: mapMovimientoHistorialContratoRow,
  },
  REMISIONES: {
    nombre: 'Movimiento Remisiones',
    hoja: 'REMISIONES',
    archivo: 'movimiento-remisiones',
    sp: 'SP_REPORTE_MOVIMIENTO_REMISIONES',
    columns: MOVIMIENTO_REMISIONES_COLUMNS,
    mapRow: mapMovimientoRemisionRow,
  },
  'ACTAS DE MEDIDA': {
    nombre: 'Movimiento Actas de Medida',
    hoja: 'ACTAS DE MEDIDA',
    archivo: 'movimiento-actas-de-medida',
    sp: 'SP_REPORTE_MOVIMIENTO_ACTAS_MEDIDA',
    columns: MOVIMIENTO_ACTAS_MEDIDA_COLUMNS,
    mapRow: mapMovimientoActaMedidaRow,
  },
};

/** Todos los SP de movimientos comparten la misma firma de 7 filtros. */
function buildMovimientoParams(query) {
  return [
    cleanParam(query?.fecha_desde),
    cleanParam(query?.fecha_hasta),
    cleanParam(query?.empresa_asociada),
    cleanParam(query?.constructora),
    cleanParam(query?.proyecto),
    cleanParam(query?.numero_contrato),
    cleanParam(query?.trabajador),
  ];
}

function callMovimiento(doc, query, cb) {
  db.query(
    `CALL ${doc.sp}(?, ?, ?, ?, ?, ?, ?)`,
    buildMovimientoParams(query),
    (err, results) => {
      if (err) return cb(err);
      const raw = Array.isArray(results?.[0]) ? results[0] : [];
      return loadInsumoNombreByCodigo((catalog) =>
        loadEmpresasNombreMap((empresas) =>
          cb(
            null,
            raw.map((r) => doc.mapRow(r, catalog, empresas))
          )
        )
      );
    }
  );
}

/** Resuelve el documento pedido; responde 400 si falta o aún no está implementado. */
function resolveMovimientoDocumento(req, res) {
  const key = normalizeDocumentoKey(req.query?.documento);
  if (!key) {
    res.status(400).json({
      code: 0,
      message: 'Seleccione el documento para generar el movimiento.',
    });
    return null;
  }
  const def = MOVIMIENTO_DOCUMENTOS[key];
  if (!def) {
    res.status(400).json({
      code: 0,
      message: `El movimiento de «${req.query.documento}» estará disponible próximamente.`,
    });
    return null;
  }
  return { key, ...def };
}

const getMovimientosPreview = (req, res) => {
  const doc = resolveMovimientoDocumento(req, res);
  if (!doc) return undefined;

  return callMovimiento(doc, req.query, (err, rows) => {
    if (err) {
      return res.status(500).json({
        code: 0,
        message: err.sqlMessage || err.message || 'Error al consultar el movimiento.',
      });
    }
    return res.status(200).json({
      code: 1,
      message: 'OK',
      data: {
        columns: doc.columns,
        rows,
        meta: {
          reporte: doc.nombre,
          documento: doc.key,
          total_items: rows.length,
          total_documentos: new Set(rows.map((r) => r.numerodoc).filter(Boolean)).size,
        },
      },
    });
  });
};

const exportMovimientos = (req, res) => {
  const doc = resolveMovimientoDocumento(req, res);
  if (!doc) return undefined;

  return callMovimiento(doc, req.query, (err, rows) => {
    if (err) {
      return res.status(500).json({
        code: 0,
        message: err.sqlMessage || err.message || 'Error al consultar el movimiento.',
      });
    }
    try {
      const aoa = [doc.columns.map((c) => c.header)];
      rows.forEach((row) => {
        aoa.push(doc.columns.map((c) => row[c.field] ?? ''));
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = doc.columns.map((c) => {
        const longest = rows.reduce(
          (max, r) => Math.max(max, String(r[c.field] ?? '').length),
          c.header.length
        );
        return { wch: Math.min(Math.max(longest + 2, 10), 50) };
      });
      ws['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: Math.max(rows.length, 1), c: doc.columns.length - 1 },
        }),
      };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, doc.hoja);
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${doc.archivo}-${stamp}.xlsx`
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      return res.status(200).send(buffer);
    } catch (e) {
      return res.status(500).json({
        code: 0,
        message: 'Error al generar el archivo Excel.',
        error: e?.message,
      });
    }
  });
};

module.exports = {
  getProductionByContractPreview,
  exportProductionByContract,
  getCarteraPreview,
  getObrasActivasPreview,
  getMovimientosPreview,
  exportMovimientos,
};
