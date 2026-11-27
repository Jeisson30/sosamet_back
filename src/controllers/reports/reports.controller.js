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

function dbQueryAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function normalizeContratoKey(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

/**
 * % ejecutado Obras Activas = cantidad remisionada / cantidad contratada (global del contrato).
 * Consultas bulk (evita N× CALL al SP de Control General / pool starvation).
 */
async function loadPctEntregadoBulk(contratosKeys) {
  const keys = [...new Set((contratosKeys || []).map(normalizeContratoKey).filter(Boolean))];
  const map = new Map();
  if (!keys.length) return map;

  const placeholders = keys.map(() => '?').join(',');
  const contratadoSql = `
    SELECT
      UPPER(TRIM(x.numdoc)) AS contrato,
      SUM(IFNULL(x.cant, 0)) AS contratado
    FROM (
      SELECT TRIM(numdoc) AS numdoc, cant
        FROM aiu
       WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
      UNION ALL
      SELECT TRIM(numdoc) AS numdoc, cant
        FROM iva_pleno
       WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
    ) x
    WHERE UPPER(TRIM(x.numdoc)) IN (${placeholders})
    GROUP BY UPPER(TRIM(x.numdoc))
  `;
  const entregadoSql = `
    SELECT
      UPPER(TRIM(contrato)) AS contrato,
      SUM(
        CASE
          WHEN cantidad REGEXP '^[0-9]+$'
            OR cantidad REGEXP '^[0-9]+[.,][0-9]+$'
            THEN CAST(REPLACE(cantidad, ',', '.') AS DECIMAL(18, 2))
          ELSE 0
        END
      ) AS entregado
    FROM remisiones_plano
    WHERE UPPER(TRIM(contrato)) IN (${placeholders})
    GROUP BY UPPER(TRIM(contrato))
  `;

  const contratadoMap = new Map();
  const entregadoMap = new Map();
  const [cRows, eRows] = await Promise.all([
    dbQueryAsync(contratadoSql, keys),
    dbQueryAsync(entregadoSql, keys),
  ]);
  for (const row of cRows || []) {
    const n = Number(row.contratado);
    contratadoMap.set(normalizeContratoKey(row.contrato), Number.isFinite(n) ? n : 0);
  }
  for (const row of eRows || []) {
    const n = Number(row.entregado);
    entregadoMap.set(normalizeContratoKey(row.contrato), Number.isFinite(n) ? n : 0);
  }

  for (const k of keys) {
    const contratado = contratadoMap.get(k) || 0;
    const entregado = entregadoMap.get(k) || 0;
    if (contratado > 0) {
      map.set(k, Math.round((entregado / contratado) * 10000) / 100);
    } else {
      map.set(k, 0);
    }
  }
  return map;
}

/** Valor contrato EAV (campo valor_contrato) o suma vr_total de ítems. */
async function loadValorContratoAsync(numeroContrato) {
  const num = String(numeroContrato ?? '').trim();
  if (!num) return null;

  const eavRows = await dbQueryAsync(
    `SELECT valor_campo_doc AS v
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
        AND (
          TRIM(numerodoc) = ?
          OR TRIM(numerodoc) = (
            SELECT TRIM(numerodoc)
              FROM item_documentos
             WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
               AND nombre_campo_doc = 'numero_contrato'
               AND TRIM(valor_campo_doc) = ?
             LIMIT 1
          )
        )
        AND nombre_campo_doc = 'valor_contrato'
      LIMIT 1`,
    [num, num]
  );
  const fromEav = parseMoneda(eavRows?.[0]?.v);
  if (fromEav != null) return fromEav;

  const sumRows = await dbQueryAsync(
    `SELECT SUM(IFNULL(vr_total, 0)) AS total
       FROM (
         SELECT vr_total FROM aiu
          WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO' AND TRIM(numdoc) = ?
         UNION ALL
         SELECT vr_total FROM iva_pleno
          WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO' AND TRIM(numdoc) = ?
       ) x`,
    [num, num]
  );
  return parseMoneda(sumRows?.[0]?.total);
}

/**
 * Facturado Control General = actas de pago (todos los tipos de pago).
 * Legado plano + módulo acta_pago (no anuladas).
 */
async function loadFacturadoActasForContrato(numeroContrato) {
  const num = String(numeroContrato ?? '').trim();
  if (!num) {
    return { pagado: 0, valorContrato: null, pct: 0 };
  }
  const pagadoMap = await loadPagadoActasBulk([num]);
  const pagado = pagadoMap.get(normalizeContratoKey(num)) || 0;
  const valorContrato = await loadValorContratoAsync(num);
  const pct =
    valorContrato != null && valorContrato > 0
      ? Math.round((pagado / valorContrato) * 10000) / 100
      : 0;
  return { pagado, valorContrato, pct };
}

/**
 * Pagado por actas de pago (legado plano + módulo acta_pago no anuladas).
 * Saldo OA = valor contratado − pagado. Todos los tipos de pago.
 */
async function loadPagadoActasBulk(contratosKeys) {
  const keys = [...new Set((contratosKeys || []).map(normalizeContratoKey).filter(Boolean))];
  const map = new Map();
  if (!keys.length) return map;

  const placeholders = keys.map(() => '?').join(',');

  const planoSql = `
    SELECT
      UPPER(TRIM(COALESCE(NULLIF(TRIM(numero_contrato), ''), NULLIF(TRIM(numerodoc), '')))) AS contrato,
      SUM(IFNULL(vr_total_documento, 0)) AS pagado
    FROM actas_pago_plano
    WHERE UPPER(TRIM(COALESCE(NULLIF(TRIM(numero_contrato), ''), NULLIF(TRIM(numerodoc), '')))) IN (${placeholders})
    GROUP BY UPPER(TRIM(COALESCE(NULLIF(TRIM(numero_contrato), ''), NULLIF(TRIM(numerodoc), ''))))
  `;

  const actaSql = `
    SELECT
      UPPER(TRIM(COALESCE(NULLIF(TRIM(numero_contrato), ''), NULLIF(TRIM(numerodoc_contrato), '')))) AS contrato,
      SUM(IFNULL(COALESCE(valor_a_pagar, valor_acta), 0)) AS pagado
    FROM acta_pago
    WHERE UPPER(TRIM(estado)) <> 'ANULADA'
      AND UPPER(TRIM(COALESCE(NULLIF(TRIM(numero_contrato), ''), NULLIF(TRIM(numerodoc_contrato), '')))) IN (${placeholders})
    GROUP BY UPPER(TRIM(COALESCE(NULLIF(TRIM(numero_contrato), ''), NULLIF(TRIM(numerodoc_contrato), ''))))
  `;

  const addRows = (rows) => {
    for (const row of rows || []) {
      const k = normalizeContratoKey(row.contrato);
      if (!k) continue;
      const n = Number(row.pagado);
      map.set(k, (map.get(k) || 0) + (Number.isFinite(n) ? n : 0));
    }
  };

  try {
    addRows(await dbQueryAsync(planoSql, keys));
  } catch (e) {
    // Tabla legado ausente: seguir con módulo nuevo.
  }
  try {
    addRows(await dbQueryAsync(actaSql, keys));
  } catch (e) {
    // Módulo acta_pago aún no migrado en algún entorno.
  }

  for (const k of keys) {
    if (!map.has(k)) map.set(k, 0);
  }
  return map;
}

const getProductionByContractPreview = async (req, res) => {
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

    let data;
    try {
      data = await new Promise((resolve, reject) => {
        callReporteContrato(numeroContrato, (spErr, d) =>
          spErr ? reject(spErr) : resolve(d)
        );
      });
    } catch (spErr) {
      const { msg, isNotFound } = normalizeSpError(spErr);
      return res.status(isNotFound ? 400 : 500).json({
        code: 0,
        message: msg,
      });
    }

    const nombreMap = await new Promise((resolve) => {
      loadInsumoNombreByCodigo((m) => resolve(m));
    });

    // Facturado = actas de pago (todos los tipos), no el 0 del SP.
    const fact = await loadFacturadoActasForContrato(numeroContrato);
    const pctFacturado = fact.pct;

    const mappedRows = (data.detalle || []).map((r) => {
      const row = mapDetalleInsumo(
        r,
        numeroContrato,
        data.contrato,
        nombreMap
      );
      const contratado = Number(row.contratado) || 0;
      return {
        ...row,
        // Sin desglose por ítem en actas: avance contractual en cada fila.
        pct_facturado: pctFacturado,
        facturado: row.facturado ?? 0,
        diff_facturado:
          contratado > 0
            ? Math.round((contratado - (row.facturado ?? 0)) * 100) / 100
            : row.diff_facturado ?? null,
      };
    });

    const pctEntregado = Number(data.resumen?.pct_entregado);
    const pctPendiente = Number.isFinite(pctEntregado)
      ? Math.max(0, Math.min(100, Math.round(100 - pctEntregado)))
      : data.resumen?.pct_pendiente ?? null;

    const resumen = data.resumen
      ? {
          ...data.resumen,
          total_facturado: fact.pagado,
          pct_facturado: pctFacturado,
          pct_pendiente: pctPendiente,
        }
      : {
          total_facturado: fact.pagado,
          pct_facturado: pctFacturado,
          pct_pendiente: pctPendiente,
        };

    return res.status(200).json({
      code: 1,
      message: 'OK',
      data: {
        columns,
        rows: mappedRows,
        meta: {
          ...meta,
          contrato: data.contrato,
          resumen,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      code: 0,
      message: 'Error al generar la vista previa del informe.',
      error: err?.message,
    });
  }
};

function classifyTipoPagoCartera(tipoPago) {
  const t = String(tipoPago || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (t.includes('rete')) return 'rete';
  if (t.includes('anticipo')) return 'anticipos';
  return 'facturacion';
}

function labelEstadoActaPago(estado) {
  const e = String(estado || '').trim().toUpperCase();
  if (e === 'EN_REVISION') return 'En revisión';
  if (e === 'FACTURADO') return 'Facturado';
  if (e === 'PAGO') return 'Pago';
  if (e === 'ANULADA') return 'Anulada';
  return e || '—';
}

/**
 * Seguimiento Cartera: filas desde acta_pago (todos los tipo_pago),
 * agrupadas por constructora + sección (rete / anticipos / facturación).
 * SP_REPORTE_CARTERA se mantiene como fallback si no hay actas.
 */
async function buildSeguimientoCarteraFromActas(opts) {
  const where = [];
  const params = [];
  // Estado pago (= acta_pago.estado). Sin filtro: todas menos anuladas.
  const estadoFiltro = opts.estado
    ? String(opts.estado).trim().toUpperCase()
    : '';
  if (
    estadoFiltro &&
    ['EN_REVISION', 'FACTURADO', 'PAGO'].includes(estadoFiltro)
  ) {
    where.push(`UPPER(TRIM(estado)) = ?`);
    params.push(estadoFiltro);
  } else {
    where.push(`UPPER(TRIM(estado)) <> 'ANULADA'`);
  }
  if (opts.numero_contrato) {
    where.push(`TRIM(numero_contrato) = ?`);
    params.push(opts.numero_contrato);
  }
  if (opts.empresa_asociada) {
    where.push(`TRIM(empresa_asociada) = ?`);
    params.push(opts.empresa_asociada);
  }
  if (opts.constructora) {
    where.push(`TRIM(constructora) = ?`);
    params.push(opts.constructora);
  }
  if (opts.proyecto) {
    where.push(`TRIM(proyecto) = ?`);
    params.push(opts.proyecto);
  }
  if (opts.fecha_desde) {
    where.push(`COALESCE(fecha_radicado, fecha_emision, DATE(fecha_creacion)) >= ?`);
    params.push(opts.fecha_desde);
  }
  if (opts.fecha_hasta) {
    where.push(`COALESCE(fecha_radicado, fecha_emision, DATE(fecha_creacion)) <= ?`);
    params.push(opts.fecha_hasta);
  }

  const rows = await dbQueryAsync(
    `SELECT id, consecutivo, numero_contrato, constructora, proyecto,
            tipo_pago, estado, valor_acta, valor_a_pagar, valor_contrato,
            saldo_por_pagar, fecha_radicado, fecha_vencimiento, fecha_emision
       FROM acta_pago
      WHERE ${where.join(' AND ')}
      ORDER BY constructora, proyecto, id DESC
      LIMIT 800`,
    params
  );

  if (!rows?.length) return null;

  const contratoKeys = [
    ...new Set(
      rows
        .map((r) => String(r.numero_contrato || '').trim())
        .filter(Boolean)
    ),
  ];
  const [pagadoMap, valorMap] = await Promise.all([
    loadPagadoActasBulk(contratoKeys),
    (async () => {
      const m = new Map();
      await Promise.all(
        contratoKeys.map(async (k) => {
          const v = await loadValorContratoAsync(k);
          m.set(normalizeContratoKey(k), v);
        })
      );
      return m;
    })(),
  ]);

  const saldoContratoOf = (numero) => {
    const key = normalizeContratoKey(numero);
    const valor =
      valorMap.get(key) ??
      null;
    const pagado = pagadoMap.get(key) || 0;
    if (valor == null) return null;
    return Math.round((valor - pagado) * 100) / 100;
  };

  const byCons = new Map();
  let totalCartera = 0;

  for (const r of rows) {
    const cons =
      String(r.constructora || '').trim() || '(Sin constructora)';
    if (!byCons.has(cons)) {
      byCons.set(cons, {
        constructora: cons,
        rete: [],
        anticipos: [],
        facturacion: [],
        total_constructora: {
          rete_garantia: 0,
          valor_anticipos: 0,
          valor: 0,
          saldo: 0,
          saldo_contrato: 0,
        },
      });
    }
    const g = byCons.get(cons);
    const valor = Number(r.valor_acta) || Number(r.valor_a_pagar) || 0;
    const saldo = saldoContratoOf(r.numero_contrato);
    const row = {
      proyecto: r.proyecto ?? null,
      contrato: r.numero_contrato ?? null,
      documento: r.consecutivo ?? null,
      valor,
      rete_garantia: valor,
      saldo,
      saldo_contrato: saldo,
      fecha_vencimiento: r.fecha_vencimiento ?? null,
      fecha_radicado: r.fecha_radicado ?? null,
      estado: labelEstadoActaPago(r.estado),
      estado_raw: r.estado ?? null,
      tipo_pago: r.tipo_pago ?? null,
      dias: null,
    };
    totalCartera += valor;
    const bucket = classifyTipoPagoCartera(r.tipo_pago);
    if (bucket === 'rete') {
      g.rete.push(row);
      g.total_constructora.rete_garantia += valor;
    } else if (bucket === 'anticipos') {
      g.anticipos.push(row);
      g.total_constructora.valor_anticipos += valor;
    } else {
      g.facturacion.push(row);
      g.total_constructora.valor += valor;
    }
    if (saldo != null) {
      g.total_constructora.saldo = saldo;
      g.total_constructora.saldo_contrato = saldo;
    }
  }

  const grupos = Array.from(byCons.values()).sort((a, b) =>
    a.constructora.localeCompare(b.constructora, 'es', { sensitivity: 'base' })
  );

  return { grupos, total_cartera: Math.round(totalCartera * 100) / 100 };
}

const getCarteraPreview = async (req, res) => {
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
    const estadoPago = req.query?.estado
      ? String(req.query.estado).trim().toUpperCase()
      : '';

    const opts = {
      numero_contrato: numeroContrato || null,
      empresa_asociada: empresaAsociada || null,
      fecha_desde: fechaDesde || null,
      fecha_hasta: fechaHasta || null,
      constructora: constructora || null,
      proyecto: proyecto || null,
      estado: estadoPago || null,
    };

    let grupos = [];
    let totalCartera = 0;
    let fuente = 'acta_pago';

    try {
      const built = await buildSeguimientoCarteraFromActas(opts);
      if (built?.grupos?.length) {
        grupos = built.grupos;
        totalCartera = built.total_cartera || 0;
      }
    } catch (e) {
      // Si falla el módulo nuevo, caer al SP legado.
      fuente = 'sp_fallback';
    }

    // Fallback SP solo si no hay actas y no se filtró por estado pago
    // (el SP no conoce EN_REVISION/FACTURADO/PAGO).
    if (!grupos.length && !opts.estado) {
      fuente = 'sp_legacy';
      const data = await new Promise((resolve, reject) => {
        callReporteCartera(opts, (spErr, d) =>
          spErr ? reject(spErr) : resolve(d)
        );
      }).catch((spErr) => {
        const { msg, isNotFound } = normalizeSpError(spErr);
        const err = new Error(msg);
        err.status = isNotFound ? 400 : 500;
        throw err;
      });
      grupos = (data.grupos || []).map((g) => ({
        ...g,
        anticipos: g.anticipos || [],
      }));
    }

    const flatFact = grupos.flatMap((g) =>
      (g.facturacion || []).map((r) => ({
        constructora: g.constructora,
        proyecto: r.proyecto,
        numero_contrato: r.contrato,
        no_documento: r.documento,
        valor: r.valor,
        saldo: r.saldo,
        fecha_vencimiento: r.fecha_vencimiento ?? null,
        estado: r.estado ?? null,
      }))
    );

    const columns = [
      { field: 'constructora', header: 'Constructora' },
      { field: 'proyecto', header: 'Proyecto' },
      { field: 'numero_contrato', header: 'No. contrato' },
      { field: 'no_documento', header: 'No. documento' },
      { field: 'valor', header: 'Valor' },
      { field: 'saldo', header: 'Saldo' },
      { field: 'fecha_vencimiento', header: 'Fecha vencimiento' },
      { field: 'estado', header: 'Estado' },
    ];

    return res.status(200).json({
      code: 1,
      message: 'OK',
      data: {
        columns,
        rows: flatFact,
        meta: {
          reporte: 'Seguimiento Cartera',
          fuente,
          filtros: opts,
          grupos,
          total_cartera: totalCartera,
          encabezado: null,
          resumen: null,
          facturacion: flatFact,
        },
      },
    });
  } catch (err) {
    return res.status(err?.status || 500).json({
      code: 0,
      message:
        err?.message ||
        'Error al generar la vista previa del informe de cartera.',
      error: err?.message,
    });
  }
};

/**
 * HISTORIAL PROYECTOS — Proyectos ejecutados.
 * Misma fuente que Obras Activas (SP_ConsultarContratosFull), sin filtro
 * de estado ACTIVO; fechas = fecha_inicio del contrato; sin %/saldo.
 */
const getHistorialProyectosPreview = async (req, res) => {
  try {
    const empresaFiltro = req.query?.empresa_asociada
      ? String(req.query.empresa_asociada).trim()
      : null;
    const constructora = req.query?.constructora
      ? String(req.query.constructora).trim()
      : null;
    const proyecto = req.query?.proyecto
      ? String(req.query.proyecto).trim()
      : null;
    const fechaDesde = req.query?.fecha_desde
      ? String(req.query.fecha_desde).trim()
      : null;
    const fechaHasta = req.query?.fecha_hasta
      ? String(req.query.fecha_hasta).trim()
      : null;

    const columns = [
      { field: 'proyecto', header: 'PROYECTO' },
      { field: 'numero_contrato', header: 'No. CONTRATO' },
      { field: 'tipo', header: 'TIPO' },
      { field: 'objeto', header: 'OBJETO' },
      { field: 'fecha_inicio', header: 'FECHA INICIO' },
      { field: 'fecha_finalizacion', header: 'FECHA FINALIZACIÓN' },
      { field: 'valor_contratado', header: 'VALOR CONTRATADO' },
      { field: 'constructora', header: 'CONSTRUCTORA' },
      { field: 'empresa_asociada', header: 'EMPRESA ASOCIADA' },
    ];

    const params = [
      null, // buscar
      null, // estado: todos (historial)
      fechaDesde || null,
      fechaHasta || null,
      empresaFiltro || null,
      constructora || null,
      proyecto || null,
    ];

    const all = (await callConsultarContratosFullAsync(params)) || [];

    const byContrato = new Map();
    for (const r of all) {
      const num = r?.numero_contrato ? String(r.numero_contrato).trim() : '';
      if (!num) continue;
      if (!byContrato.has(num)) byContrato.set(num, r);
    }

    const rows = Array.from(byContrato.values())
      .map((c) => {
        const num = String(c.numero_contrato).trim();
        const valorContratado = parseMoneda(c.valor_contrato);
        return {
          proyecto: c.proyecto ?? null,
          numero_contrato: num,
          tipo: c.tipo_contrato ?? null,
          objeto: c.descripcion ?? null,
          fecha_inicio: c.fecha_inicio ?? null,
          fecha_finalizacion: c.fecha_fin ?? null,
          valor_contratado: valorContratado ?? c.valor_contrato ?? null,
          constructora: c.empresa ?? null,
          empresa_asociada: c.empresa_asociada ?? null,
        };
      })
      .sort((a, b) => {
        const ca = String(a.constructora || '').localeCompare(
          String(b.constructora || ''),
          'es'
        );
        if (ca !== 0) return ca;
        return String(a.proyecto || '').localeCompare(
          String(b.proyecto || ''),
          'es'
        );
      });

    return res.status(200).json({
      code: 1,
      message: 'OK',
      data: {
        columns,
        rows,
        meta: {
          reporte: 'Proyectos ejecutados',
          filtros: {
            fecha_desde: fechaDesde,
            fecha_hasta: fechaHasta,
            empresa_asociada: empresaFiltro,
            constructora,
            proyecto,
          },
        },
      },
    });
  } catch (err) {
    console.error('Error Historial Proyectos:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al generar la vista previa de Historial Proyectos.',
      error: err?.message,
    });
  }
};

const getObrasActivasPreview = async (req, res) => {
  try {
    // Contratos ACTIVO (emp. 1 y/o 2):
    // ejecutado = % remisionado/contratado (bulk remisiones);
    // saldo = valor contratado − actas de pago (plano + acta_pago).
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

    const contratos = Array.from(byContrato.values());
    const keys = contratos.flatMap((c) => {
      const num = String(c.numero_contrato ?? '').trim();
      const doc = String(c.numerodoc ?? '').trim();
      return [num, doc].filter(Boolean);
    });

    const [ejecutadoMap, pagadoMap] = await Promise.all([
      loadPctEntregadoBulk(keys),
      loadPagadoActasBulk(keys),
    ]);

    const rows = contratos.map((c) => {
      const num = String(c.numero_contrato).trim();
      const doc = String(c.numerodoc ?? '').trim();
      const keyNum = normalizeContratoKey(num);
      const keyDoc = normalizeContratoKey(doc);

      const ejecutado = ejecutadoMap.has(keyNum)
        ? ejecutadoMap.get(keyNum)
        : keyDoc && ejecutadoMap.has(keyDoc)
          ? ejecutadoMap.get(keyDoc)
          : 0;

      const valorContratado = parseMoneda(c.valor_contrato);
      // Un solo key de pago: evita sumar dos veces si numerodoc ≠ numero_contrato
      // pero el acta quedó indexada solo por uno de ellos.
      const pagado = pagadoMap.has(keyNum)
        ? pagadoMap.get(keyNum) || 0
        : keyDoc && pagadoMap.has(keyDoc)
          ? pagadoMap.get(keyDoc) || 0
          : 0;
      const saldo =
        valorContratado != null
          ? Math.round((valorContratado - pagado) * 100) / 100
          : null;

      return {
        proyecto: c.proyecto ?? null,
        numero_contrato: num,
        tipo: c.tipo_contrato ?? null,
        objeto: c.descripcion ?? null,
        fecha_inicio: c.fecha_inicio ?? null,
        fecha_finalizacion: c.fecha_fin ?? null,
        valor_contratado: valorContratado ?? c.valor_contrato ?? null,
        ejecutado,
        saldo,
        constructora: c.empresa ?? null,
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

const exportProductionByContract = async (req, res) => {
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

  try {
    let data;
    try {
      data = await new Promise((resolve, reject) => {
        callReporteContrato(numeroContrato, (spErr, d) =>
          spErr ? reject(spErr) : resolve(d)
        );
      });
    } catch (spErr) {
      const { msg, isNotFound } = normalizeSpError(spErr);
      return res.status(isNotFound ? 400 : 500).json({
        code: 0,
        message: msg,
      });
    }

    const nombreMap = await new Promise((resolve) => {
      loadInsumoNombreByCodigo((m) => resolve(m));
    });
    const fact = await loadFacturadoActasForContrato(numeroContrato);
    const pctFacturado = fact.pct;

    const headers = columns.map((c) => c.header);
    const aoa = [headers];

    (data.detalle || []).forEach((row) => {
      const rowObj = mapDetalleInsumo(
        row,
        numeroContrato,
        data.contrato,
        nombreMap
      );
      const display = {
        ...rowObj,
        pct_facturado: pctFacturado,
      };
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
      aoa.push(['Total facturado (actas de pago)', fact.pagado]);
      aoa.push(['% fabricado', data.resumen.pct_fabricado ?? '']);
      aoa.push(['% entregado', data.resumen.pct_entregado ?? '']);
      aoa.push(['% instalado', data.resumen.pct_instalado ?? '']);
      aoa.push(['% facturado (actas de pago)', pctFacturado]);
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

/**
 * Seguimiento Contrato (tarjeta PRODUCCIÓN) — opción A:
 * - Tabla base = plano actual (aiu ∪ iva_pleno, ya con Otros Sí aplicados).
 * - Remisionado = Σ remisiones_plano por ítem (mismo matcher que Detalle remisión).
 * - Saldo = contratado − remisionado (rojo en front si < 0).
 * - Bloques Otros Sí = delta (cantidad_adicional); remisionado delta = 0 (no atribuible).
 * - Solo Otros Sí ACTIVO; AMBOS → sección cantidades (si hay ítems) + sección prórroga (si hay fecha).
 */
function toCantidadNum(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const s = String(value).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/** Misma regla que actaMedidaContexto (excluye anuladas). */
function isRemisionAnuladaEstado(estado) {
  const v = String(estado ?? '')
    .trim()
    .toUpperCase();
  return v === '3' || v === 'ANULADA' || v === 'ANULADO';
}

/**
 * Match contrato remisión: exacto + prefijo (DINTEL↔DINTELES) + EAV numero_contrato.
 * Misma lógica que loadAcumuladoRemisiones (Detalle remisión).
 */
function sqlMatchClaveRemision(aliasPlano, aliasEav) {
  return `
  (
    UPPER(TRIM(IFNULL(${aliasPlano}, ''))) = UPPER(?)
    OR UPPER(TRIM(IFNULL(${aliasEav}, ''))) = UPPER(?)
    OR (
      CHAR_LENGTH(?) >= 4
      AND (
        (
          CHAR_LENGTH(TRIM(IFNULL(${aliasPlano}, ''))) >= 4
          AND (
            UPPER(TRIM(${aliasPlano})) LIKE CONCAT(UPPER(?), '%')
            OR UPPER(?) LIKE CONCAT(UPPER(TRIM(${aliasPlano})), '%')
          )
        )
        OR (
          CHAR_LENGTH(TRIM(IFNULL(${aliasEav}, ''))) >= 4
          AND (
            UPPER(TRIM(${aliasEav})) LIKE CONCAT(UPPER(?), '%')
            OR UPPER(?) LIKE CONCAT(UPPER(TRIM(${aliasEav})), '%')
          )
        )
      )
    )
  )
`;
}

function paramsMatchClaveRemision(numeroContrato) {
  const nc = String(numeroContrato ?? '').trim();
  return [nc, nc, nc, nc, nc, nc, nc];
}

/** Σ remisionado por ítem; dedupe por id si se consultan varias claves. */
async function loadRemisionadoMapSeguimiento(claves) {
  const unique = [
    ...new Set(
      (claves || [])
        .map((c) => String(c ?? '').trim())
        .filter(Boolean)
    ),
  ];
  const remMap = new Map();
  const seenIds = new Set();

  for (const clave of unique) {
    const rows = await dbQueryAsync(
      `SELECT
          rp.id,
          TRIM(rp.item) AS item,
          rp.cantidad AS cantidad,
          est.valor_campo_doc AS estado
        FROM remisiones_plano rp
        LEFT JOIN item_documentos nc
          ON nc.numerodoc = rp.numerodoc
         AND UPPER(TRIM(nc.tipo_doc)) = 'REMISIONES'
         AND LOWER(nc.nombre_campo_doc) = 'numero_contrato'
        LEFT JOIN item_documentos est
          ON est.numerodoc = rp.numerodoc
         AND UPPER(TRIM(est.tipo_doc)) = 'REMISIONES'
         AND LOWER(est.nombre_campo_doc) = 'estado'
       WHERE ${sqlMatchClaveRemision('rp.contrato', 'nc.valor_campo_doc')}`,
      paramsMatchClaveRemision(clave)
    );

    for (const r of rows || []) {
      if (isRemisionAnuladaEstado(r.estado)) continue;
      const id = r.id != null ? Number(r.id) : null;
      if (id != null && Number.isFinite(id)) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      const itemKey = String(r.item ?? '')
        .trim()
        .toUpperCase();
      if (!itemKey) continue;
      const n = Number(String(r.cantidad ?? '').trim().replace(',', '.'));
      const add = Number.isFinite(n) ? n : 0;
      remMap.set(itemKey, (remMap.get(itemKey) || 0) + add);
    }
  }

  return remMap;
}

async function resolveContratoNumerodoc(numeroContrato) {
  // Normaliza lo que pegan desde consulta (espacios, "No.", etc.).
  let num = String(numeroContrato || '').trim();
  if (!num) return null;
  num = num
    .replace(/^(no\.?|n[ºo°]\.?|contrato)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!num) return null;

  const rows = await dbQueryAsync(
    `SELECT TRIM(numerodoc) AS numerodoc
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
        AND (
          TRIM(numerodoc) = ?
          OR (nombre_campo_doc = 'numero_contrato' AND TRIM(valor_campo_doc) = ?)
          OR (nombre_campo_doc = 'tipo_doc_contratista' AND TRIM(valor_campo_doc) = ?)
        )
      LIMIT 1`,
    [num, num, num]
  );
  return rows?.[0]?.numerodoc ? String(rows[0].numerodoc).trim() : null;
}

async function loadSeguimientoContratoDataset(numeroContrato) {
  const numerodoc = await resolveContratoNumerodoc(numeroContrato);
  if (!numerodoc) {
    const typed = String(numeroContrato || '').trim();
    const err = new Error(
      `No se encontró el contrato «${typed}» en la base de datos activa. ` +
        'Use el N° Documento / N° contrato de la consulta (misma BD que el API).'
    );
    err.isNotFound = true;
    throw err;
  }

  const cabRows = await dbQueryAsync(
    `SELECT
        TRIM(numerodoc) AS numerodoc,
        MAX(CASE WHEN nombre_campo_doc = 'numero_contrato'    THEN TRIM(valor_campo_doc) END) AS numero_contrato,
        MAX(CASE WHEN nombre_campo_doc = 'empresa'            THEN TRIM(valor_campo_doc) END) AS empresa,
        MAX(CASE WHEN nombre_campo_doc = 'proyecto'           THEN TRIM(valor_campo_doc) END) AS proyecto,
        MAX(CASE WHEN nombre_campo_doc = 'tipo_contrato'      THEN TRIM(valor_campo_doc) END) AS tipo_contrato,
        MAX(CASE WHEN nombre_campo_doc = 'ciudad_empresa'     THEN TRIM(valor_campo_doc) END) AS ciudad,
        MAX(CASE WHEN nombre_campo_doc = 'descripcion'        THEN TRIM(valor_campo_doc) END) AS descripcion,
        MAX(CASE WHEN nombre_campo_doc = 'empresa_asociada'   THEN TRIM(valor_campo_doc) END) AS empresa_asociada,
        MAX(CASE WHEN nombre_campo_doc = 'encargado_contrato' THEN TRIM(valor_campo_doc) END) AS id_encargado,
        MAX(CASE WHEN nombre_campo_doc = 'fecha_inicio'       THEN TRIM(valor_campo_doc) END) AS fecha_inicio,
        MAX(CASE WHEN nombre_campo_doc = 'fecha_fin'          THEN TRIM(valor_campo_doc) END) AS fecha_fin,
        MAX(CASE WHEN nombre_campo_doc = 'estado'             THEN TRIM(valor_campo_doc) END) AS estado
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
        AND TRIM(numerodoc) = ?
      GROUP BY TRIM(numerodoc)
      LIMIT 1`,
    [numerodoc]
  );
  const cab = cabRows?.[0];
  if (!cab) {
    const err = new Error('El contrato no existe.');
    err.isNotFound = true;
    throw err;
  }

  let encargado = null;
  const idEnc = String(cab.id_encargado || '').trim();
  if (/^\d+$/.test(idEnc)) {
    const uRows = await dbQueryAsync(
      `SELECT TRIM(CONCAT(IFNULL(nombre, ''), ' ', IFNULL(apellido, ''))) AS nombre
         FROM usuarios WHERE id_usuario = ? LIMIT 1`,
      [Number(idEnc)]
    );
    encargado = String(uRows?.[0]?.nombre || '').trim() || null;
  }

  const itemRows = await dbQueryAsync(
    `SELECT 'AIU' AS tabla_origen, a.id AS id_item, a.ref, a.item, a.descripcion,
            a.observaciones, a.und AS um, a.cant AS cantidad
       FROM aiu a
      WHERE TRIM(a.numdoc) = ?
      UNION ALL
     SELECT 'IVA', i.id, i.ref, i.item, i.descripcion, i.observaciones, i.und, i.cant
       FROM iva_pleno i
      WHERE TRIM(i.numdoc) = ?
      ORDER BY tabla_origen, id_item`,
    [numerodoc, numerodoc]
  );

  const numeroVisible = String(cab.numero_contrato || numerodoc).trim();
  // Mismo criterio que Detalle remisión (exacto + prefijo + EAV); no solo IN exacto.
  const remMap = await loadRemisionadoMapSeguimiento([numeroVisible, numerodoc]);

  const items = (itemRows || []).map((r) => {
    const item = String(r.item || '').trim();
    const contratado = toCantidadNum(r.cantidad);
    const remisionado = remMap.get(item.toUpperCase()) || 0;
    const obs =
      r.observaciones != null && String(r.observaciones).trim()
        ? String(r.observaciones).trim()
        : null;
    return {
      ref: r.ref != null ? String(r.ref).trim() : null,
      item: item || null,
      descripcion: r.descripcion != null ? String(r.descripcion).trim() : null,
      observaciones: obs,
      um: r.um != null ? String(r.um).trim() : null,
      contratado: round2(contratado),
      remisionado: round2(remisionado),
      diferencia: round2(contratado - remisionado),
    };
  });

  const otrosiCab = await dbQueryAsync(
    `SELECT id_otrosi, consecutivo, no_documento, tipo, observaciones,
            DATE_FORMAT(fecha_documento, '%Y-%m-%d') AS fecha_documento,
            DATE_FORMAT(fecha_fin_anterior, '%Y-%m-%d') AS fecha_fin_anterior,
            DATE_FORMAT(fecha_fin_nueva, '%Y-%m-%d') AS fecha_fin_nueva,
            dias_ampliacion
       FROM contrato_otrosi
      WHERE TRIM(numerodoc) = ?
        AND UPPER(TRIM(estado)) = 'ACTIVO'
      ORDER BY consecutivo ASC, id_otrosi ASC`,
    [numerodoc]
  );

  const otrosi = [];
  for (const o of otrosiCab || []) {
    const tipo = String(o.tipo || '').trim().toUpperCase();
    const noDoc = String(o.no_documento || '').trim();
    const descOtrosi =
      (o.observaciones != null && String(o.observaciones).trim()) ||
      (cab.descripcion != null && String(cab.descripcion).trim()) ||
      null;

    let detalleItems = [];
    if (tipo === 'CANTIDAD' || tipo === 'AMBOS') {
      detalleItems = await dbQueryAsync(
        `SELECT d.ref, d.item, d.detalle, d.um, d.cantidad_adicional, d.es_nuevo,
                d.id_item_origen, d.tabla_origen
           FROM contrato_otrosi_detalle d
          WHERE d.id_otrosi = ?
          ORDER BY d.id_detalle`,
        [o.id_otrosi]
      );
    }

    if ((tipo === 'CANTIDAD' || tipo === 'AMBOS') && detalleItems.length) {
      const planeById = new Map();
      for (const r of itemRows || []) {
        planeById.set(`${r.tabla_origen}:${r.id_item}`, r);
      }
      otrosi.push({
        kind: 'cantidad',
        titulo: 'OTROSÍ - AUMENTO DE CANTIDADES',
        id_otrosi: o.id_otrosi,
        consecutivo: o.consecutivo,
        no_documento: noDoc,
        descripcion: descOtrosi,
        items: detalleItems.map((d) => {
          const contratado = toCantidadNum(d.cantidad_adicional);
          const originKey = `${String(d.tabla_origen || '').trim()}:${d.id_item_origen}`;
          const origin = planeById.get(originKey);
          const ref =
            (d.ref != null && String(d.ref).trim()) ||
            (origin?.ref != null ? String(origin.ref).trim() : null) ||
            null;
          const itemCode =
            (d.item != null && String(d.item).trim()) ||
            (origin?.item != null ? String(origin.item).trim() : null) ||
            null;
          const descripcion =
            (d.detalle != null && String(d.detalle).trim()) ||
            (origin?.descripcion != null ? String(origin.descripcion).trim() : null) ||
            null;
          const um =
            (d.um != null && String(d.um).trim()) ||
            (origin?.um != null ? String(origin.um).trim() : null) ||
            null;
          const observaciones =
            origin?.observaciones != null && String(origin.observaciones).trim()
              ? String(origin.observaciones).trim()
              : null;
          return {
            ref,
            item: itemCode,
            descripcion,
            observaciones,
            um,
            contratado: round2(contratado),
            remisionado: 0,
            diferencia: round2(contratado),
          };
        }),
      });
    }

    if ((tipo === 'FECHA' || tipo === 'AMBOS') && o.fecha_fin_nueva) {
      otrosi.push({
        kind: 'prorroga',
        titulo: 'OTROSÍ - PRÓRROGA DE TIEMPO',
        id_otrosi: o.id_otrosi,
        consecutivo: o.consecutivo,
        no_documento: noDoc,
        descripcion: descOtrosi,
        fecha_inicio: o.fecha_fin_anterior || cab.fecha_inicio || null,
        fecha_fin: o.fecha_fin_nueva,
        dias_ampliacion: o.dias_ampliacion != null ? Number(o.dias_ampliacion) : null,
        encargado,
      });
    }
  }

  return {
    columns: [
      { field: 'ref', header: 'REF' },
      { field: 'item', header: 'ITEM' },
      { field: 'descripcion', header: 'DESCRIPCIÓN' },
      { field: 'um', header: 'UM' },
      { field: 'contratado', header: 'CONTRATADO' },
      { field: 'remisionado', header: 'REMISIONADO' },
      { field: 'diferencia', header: 'DIFERENCIA' },
    ],
    rows: items,
    meta: {
      reporte: 'Seguimiento Contrato',
      tipo_informe: 'seguimiento-contrato',
      numero_contrato: numeroVisible,
      contrato: {
        numerodoc,
        numero_contrato: numeroVisible,
        empresa: cab.empresa || null,
        proyecto: cab.proyecto || null,
        tipo_contrato: cab.tipo_contrato || null,
        ciudad: cab.ciudad || null,
        descripcion: cab.descripcion || null,
        empresa_asociada: cab.empresa_asociada || null,
        encargado,
        fecha_inicio: cab.fecha_inicio || null,
        fecha_fin: cab.fecha_fin || null,
        estado: cab.estado || 'Activo',
      },
      otrosi,
    },
  };
}

const getSeguimientoContratoPreview = async (req, res) => {
  try {
    const numeroContrato = req.query?.numero_contrato
      ? String(req.query.numero_contrato).trim()
      : '';

    if (!numeroContrato) {
      return res.status(400).json({
        code: 0,
        message: 'Digite el número de contrato para generar el Seguimiento Contrato.',
      });
    }

    const data = await loadSeguimientoContratoDataset(numeroContrato);
    return res.status(200).json({
      code: 1,
      message: 'OK',
      data,
    });
  } catch (err) {
    if (err?.isNotFound) {
      return res.status(400).json({
        code: 0,
        message: err.message || 'El contrato no existe.',
      });
    }
    console.error('Error Seguimiento Contrato:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al generar la vista previa de Seguimiento Contrato.',
      error: err?.message,
    });
  }
};

const COLORS_AVANCE = {
  contrato: '#1e3a5f',
  actas: '#2e7d32',
  fabricacion: '#43a047',
  remisiones: '#f9a825',
  instalacion: '#7b1fa2',
};

function pctVsBase(value, base) {
  const b = Number(base) || 0;
  if (b <= 0) return 0;
  return round2(((Number(value) || 0) / b) * 100);
}

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(100, round2(v));
}

async function loadEncargadoContrato(numerodoc) {
  const rows = await dbQueryAsync(
    `SELECT TRIM(valor_campo_doc) AS id_encargado
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
        AND TRIM(numerodoc) = ?
        AND nombre_campo_doc = 'encargado_contrato'
      LIMIT 1`,
    [numerodoc]
  );
  const id = String(rows?.[0]?.id_encargado || '').trim();
  if (!/^\d+$/.test(id)) return null;
  const uRows = await dbQueryAsync(
    `SELECT TRIM(CONCAT(IFNULL(nombre, ''), ' ', IFNULL(apellido, ''))) AS nombre
       FROM usuarios WHERE id_usuario = ? LIMIT 1`,
    [Number(id)]
  );
  return String(uRows?.[0]?.nombre || '').trim() || null;
}

async function loadActasPorInsumo(numeroContrato) {
  const keys = [...new Set([String(numeroContrato || '').trim()].filter(Boolean))];
  if (!keys.length) return new Map();
  try {
    const rows = await dbQueryAsync(
      `SELECT UPPER(TRIM(COALESCE(NULLIF(amd_insumo_codigo, ''), CONCAT('SIN-', IFNULL(amd_item, 'X'))))) AS insumo_key,
              SUM(IFNULL(amd_cantidad, 0)) AS actas
         FROM actas_medida_detalle
        WHERE TRIM(amd_numero_contrato) = ?
          AND IFNULL(amd_estado, 1) <> 3
        GROUP BY UPPER(TRIM(COALESCE(NULLIF(amd_insumo_codigo, ''), CONCAT('SIN-', IFNULL(amd_item, 'X')))))`,
      [keys[0]]
    );
    const map = new Map();
    for (const r of rows || []) {
      map.set(String(r.insumo_key || '').trim().toUpperCase(), toCantidadNum(r.actas));
    }
    return map;
  } catch (err) {
    console.warn('Avance: actas por insumo no disponibles:', err?.message);
    return new Map();
  }
}

async function loadOtTiemposYContratistas(numeroContrato) {
  const num = String(numeroContrato || '').trim();
  const empty = { tiempos: [], fabricacion: [], instalacion: [] };
  if (!num) return empty;
  try {
    const tiempos = await dbQueryAsync(
      `SELECT
          t.insumo_key,
          ROUND(AVG(t.dias), 1) AS prom_dias,
          ROUND(100 * SUM(t.ok) / NULLIF(COUNT(*), 0), 1) AS cumplimiento
         FROM (
           SELECT DISTINCT
                  ow.id_order_work,
                  UPPER(TRIM(COALESCE(NULLIF(amd.amd_insumo_codigo, ''), 'SIN-INSUMO'))) AS insumo_key,
                  DATEDIFF(ow.fecha_entrega, DATE(ow.fecha_creacion)) AS dias,
                  CASE
                    WHEN ow.ot_estado = 2
                     AND DATE(IFNULL(ec.fecha_finalizado, ow.fecha_entrega)) <= ow.fecha_entrega
                      THEN 1
                    WHEN IFNULL(ow.ot_estado, 1) = 1
                     AND ow.fecha_entrega >= CURDATE()
                      THEN 1
                    ELSE 0
                  END AS ok
             FROM order_work ow
             LEFT JOIN ejecucion_corte ec ON ec.id_order_work = ow.id_order_work
             LEFT JOIN order_work_detail owd
               ON owd.id_order_work = ow.id_order_work AND IFNULL(owd.owd_estado, 1) <> 3
             LEFT JOIN actas_medida_detalle amd ON amd.amd_id = owd.amd_id
            WHERE TRIM(ow.ot_contrato) = ?
              AND IFNULL(ow.ot_estado, 1) <> 3
              AND ow.fecha_entrega IS NOT NULL
         ) t
         GROUP BY t.insumo_key`,
      [num]
    );

    const contratistasSql = `
      SELECT
          ow.encargado_id AS id,
          TRIM(CONCAT(IFNULL(u.nombre, ''), ' ', IFNULL(u.apellido, ''))) AS contratista,
          COUNT(DISTINCT owd.id_order_work_detail) AS elementos_asignados,
          COUNT(DISTINCT ow.id_order_work) AS ordenes,
          COUNT(DISTINCT CASE WHEN IFNULL(ow.ot_estado, 1) = 2 THEN ow.id_order_work END) AS terminadas
         FROM order_work ow
         LEFT JOIN usuarios u ON u.id_usuario = ow.encargado_id
         LEFT JOIN order_work_detail owd
           ON owd.id_order_work = ow.id_order_work AND IFNULL(owd.owd_estado, 1) <> 3
        WHERE TRIM(ow.ot_contrato) = ?
          AND IFNULL(ow.ot_estado, 1) <> 3
          AND ow.encargado_id IS NOT NULL
          AND UPPER(TRIM(REPLACE(REPLACE(IFNULL(ow.tipo_corte, ''), 'Á', 'A'), 'É', 'E'))) LIKE ?
        GROUP BY ow.encargado_id, u.nombre, u.apellido
        ORDER BY contratista`;

    const [fabRows, instRows] = await Promise.all([
      dbQueryAsync(contratistasSql, [num, 'FABRIC%']),
      dbQueryAsync(contratistasSql, [num, 'INSTAL%']),
    ]);

    const mapContratistas = (rows) =>
      (rows || []).map((r) => {
        const ordenes = Number(r.ordenes) || 0;
        const terminadas = Number(r.terminadas) || 0;
        return {
          contratista: String(r.contratista || '').trim() || '—',
          elementos_asignados: Number(r.elementos_asignados) || 0,
          ordenes,
          terminadas,
          pct_cumplimiento: ordenes > 0 ? clampPct((terminadas / ordenes) * 100) : 0,
        };
      });

    return {
      tiempos: (tiempos || []).map((r) => ({
        insumo_key: String(r.insumo_key || '').trim().toUpperCase(),
        prom_dias: r.prom_dias == null ? null : Number(r.prom_dias),
        cumplimiento: r.cumplimiento == null ? 0 : clampPct(r.cumplimiento),
      })),
      fabricacion: mapContratistas(fabRows),
      instalacion: mapContratistas(instRows),
    };
  } catch (err) {
    console.warn('Avance: OT/tiempos/contratistas no disponibles:', err?.message);
    return empty;
  }
}

async function loadAvanceProduccionDataset(numeroContrato) {
  const numerodoc = await resolveContratoNumerodoc(numeroContrato);
  if (!numerodoc) {
    const typed = String(numeroContrato || '').trim();
    const err = new Error(
      `No se encontró el contrato «${typed}» en la base de datos activa. ` +
        'Use el N° Documento / N° contrato de la consulta (misma BD que el API).'
    );
    err.isNotFound = true;
    throw err;
  }

  let spData;
  try {
    spData = await new Promise((resolve, reject) => {
      callReporteContrato(numerodoc, (spErr, d) => (spErr ? reject(spErr) : resolve(d)));
    });
  } catch (spErr) {
    // Fallback: intentar con el texto digitado (legacy numerodoc = número visible).
    try {
      spData = await new Promise((resolve, reject) => {
        callReporteContrato(String(numeroContrato).trim(), (e, d) =>
          e ? reject(e) : resolve(d)
        );
      });
    } catch (e2) {
      const { msg, isNotFound } = normalizeSpError(spErr);
      const err = new Error(msg);
      err.isNotFound = isNotFound;
      throw err;
    }
  }

  const catalog = await new Promise((resolve) => loadInsumoNombreByCodigo((m) => resolve(m)));
  const [actasMap, otData, encargado] = await Promise.all([
    loadActasPorInsumo(numerodoc),
    loadOtTiemposYContratistas(numerodoc),
    loadEncargadoContrato(numerodoc),
  ]);
  // También intentar actas/OT con número visible si difiere.
  const numeroVisible = String(
    spData?.contrato?.numero_contrato || numerodoc
  ).trim();
  if (numeroVisible && numeroVisible !== numerodoc) {
    const [actas2, ot2] = await Promise.all([
      loadActasPorInsumo(numeroVisible),
      loadOtTiemposYContratistas(numeroVisible),
    ]);
    for (const [k, v] of actas2) {
      actasMap.set(k, (actasMap.get(k) || 0) + v);
    }
    if (!otData.tiempos.length && ot2.tiempos.length) otData.tiempos = ot2.tiempos;
    if (!otData.fabricacion.length && ot2.fabricacion.length) {
      otData.fabricacion = ot2.fabricacion;
    }
    if (!otData.instalacion.length && ot2.instalacion.length) {
      otData.instalacion = ot2.instalacion;
    }
  }

  const tiemposMap = new Map(
    (otData.tiempos || []).map((t) => [t.insumo_key, t])
  );

  const rows = (spData?.detalle || []).map((r) => {
    const mapped = mapDetalleInsumo(r, numerodoc, spData.contrato, catalog);
    const key = normalizeInsumoCodeKey(mapped.insumo) || String(mapped.insumo || '').toUpperCase();
    const actas =
      actasMap.get(String(mapped.insumo || '').toUpperCase()) ||
      actasMap.get(key) ||
      0;
    const contratado = toCantidadNum(mapped.contratado);
    const fabricado = toCantidadNum(mapped.fabricado);
    const enviado = toCantidadNum(mapped.entregado);
    const instalado = toCantidadNum(mapped.instalado);
    const label =
      mapped.insumo && mapped.insumo_nombre
        ? `${mapped.insumo} - ${mapped.insumo_nombre}`
        : mapped.insumo_nombre || mapped.insumo || '—';
    const tiempo =
      tiemposMap.get(String(mapped.insumo || '').toUpperCase()) ||
      tiemposMap.get(key) ||
      null;
    const pctAvance = pctVsBase(enviado, contratado);
    return {
      elemento: label,
      insumo: mapped.insumo,
      um: mapped.um,
      contratado: round2(contratado),
      actas_medida: round2(actas),
      fabricado: round2(fabricado),
      enviado: round2(enviado),
      instalado: round2(instalado),
      pct_avance: pctAvance,
      pct_fabricado: pctVsBase(fabricado, contratado),
      pct_remisionado: pctAvance,
      pct_instalado: pctVsBase(instalado, contratado),
      pct_actas: pctVsBase(actas, contratado),
      prom_dias: tiempo?.prom_dias ?? null,
      cumplimiento: tiempo?.cumplimiento ?? null,
    };
  });

  const totContratado = rows.reduce((a, r) => a + (Number(r.contratado) || 0), 0);
  const totActas = rows.reduce((a, r) => a + (Number(r.actas_medida) || 0), 0);
  const totFab = rows.reduce((a, r) => a + (Number(r.fabricado) || 0), 0);
  const totRem = rows.reduce((a, r) => a + (Number(r.enviado) || 0), 0);
  const totInst = rows.reduce((a, r) => a + (Number(r.instalado) || 0), 0);
  const pctEjecutado = pctVsBase(totRem, totContratado);

  const procesos = {
    fabricacion: {
      label: 'Fabricación',
      hecho: round2(totFab),
      base: round2(totContratado),
      pct: pctVsBase(totFab, totContratado),
      color: COLORS_AVANCE.fabricacion,
    },
    remisiones: {
      label: 'Remisiones',
      hecho: round2(totRem),
      base: round2(totContratado),
      pct: pctVsBase(totRem, totContratado),
      color: COLORS_AVANCE.remisiones,
    },
    instalacion: {
      label: 'Instalación',
      hecho: round2(totInst),
      base: round2(totContratado),
      pct: pctVsBase(totInst, totContratado),
      color: COLORS_AVANCE.instalacion,
    },
  };

  const comparativo = rows.map((r) => ({
    label: r.elemento,
    actas: r.actas_medida,
    fabricacion: r.fabricado,
    remisiones: r.enviado,
    instalacion: r.instalado,
  }));

  const tiempos = rows
    .filter((r) => r.prom_dias != null || r.cumplimiento != null)
    .map((r) => ({
      elemento: r.elemento,
      prom_dias: r.prom_dias,
      cumplimiento: r.cumplimiento ?? 0,
    }));

  const totalGeneral = {
    ejecutado_pct: pctEjecutado,
    ejecutado_hecho: round2(totRem),
    ejecutado_base: round2(totContratado),
    series: [
      { label: 'Contrato', pct: totContratado > 0 ? 100 : 0, color: COLORS_AVANCE.contrato },
      {
        label: 'Actas de medida',
        pct: pctVsBase(totActas, totContratado),
        color: COLORS_AVANCE.actas,
      },
      {
        label: 'Fabricación',
        pct: pctVsBase(totFab, totContratado),
        color: COLORS_AVANCE.fabricacion,
      },
      {
        label: 'Remisiones',
        pct: pctVsBase(totRem, totContratado),
        color: COLORS_AVANCE.remisiones,
      },
      {
        label: 'Instalación',
        pct: pctVsBase(totInst, totContratado),
        color: COLORS_AVANCE.instalacion,
      },
    ],
  };

  const contrato = {
    ...(spData?.contrato || {}),
    numero_contrato: numeroVisible,
    numerodoc,
    encargado: encargado || null,
    descripcion:
      spData?.contrato?.descripcion || spData?.contrato?.objeto || null,
  };

  return {
    columns: [
      { field: 'elemento', header: 'Elemento' },
      { field: 'contratado', header: 'Total contratado' },
      { field: 'actas_medida', header: 'Actas Medida' },
      { field: 'fabricado', header: 'Fabricado' },
      { field: 'enviado', header: 'Enviado' },
      { field: 'instalado', header: 'Instalado' },
      { field: 'pct_avance', header: '% avance' },
    ],
    rows,
    meta: {
      reporte: 'Avance de producción por contrato',
      tipo_informe: 'avance-produccion-contrato',
      numero_contrato: numeroVisible,
      contrato,
      procesos,
      comparativo,
      tiempos,
      total_general: totalGeneral,
      contratistas: {
        fabricacion: otData.fabricacion,
        instalacion: otData.instalacion,
      },
      resumen: {
        total_contratado: round2(totContratado),
        total_actas: round2(totActas),
        total_fabricado: round2(totFab),
        total_remisionado: round2(totRem),
        total_instalado: round2(totInst),
        pct_ejecutado: pctEjecutado,
      },
    },
  };
}

const getAvanceProduccionContratoPreview = async (req, res) => {
  try {
    const numeroContrato = req.query?.numero_contrato
      ? String(req.query.numero_contrato).trim()
      : '';
    if (!numeroContrato) {
      return res.status(400).json({
        code: 0,
        message:
          'Digite el número de contrato para generar el Avance de producción.',
      });
    }
    const data = await loadAvanceProduccionDataset(numeroContrato);
    return res.status(200).json({ code: 1, message: 'OK', data });
  } catch (err) {
    if (err?.isNotFound) {
      return res.status(400).json({
        code: 0,
        message: err.message || 'El contrato no existe.',
      });
    }
    console.error('Error Avance Producción:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al generar el Avance de producción por contrato.',
      error: err?.message,
    });
  }
};

module.exports = {
  getProductionByContractPreview,
  exportProductionByContract,
  getCarteraPreview,
  getObrasActivasPreview,
  getHistorialProyectosPreview,
  getMovimientosPreview,
  exportMovimientos,
  getSeguimientoContratoPreview,
  getAvanceProduccionContratoPreview,
};
