const XLSX = require('xlsx');
const db = require('../../config/db');

/**
 * Estructura alineada con CONSULTAS GENERAL (PDF) — producción por contrato.
 * Consume SP_REPORTE_CONTRATO(p_numero_contrato).
 */
function buildProductionByContractDataset(query) {
  const {
    numero_contrato: rawNum,
    documento: rawDoc,
    tipo_corte: rawTipoCorte,
  } = query;

  const columns = [
    { field: 'numero_contrato', header: 'N° contrato' },
    { field: 'item', header: 'Ítem' },
    { field: 'descripcion', header: 'Descripción' },
    { field: 'um', header: 'UM' },
    { field: 'contratado', header: 'Contratado' },
    { field: 'entregado', header: 'Entregado' },
    { field: 'instalado', header: 'Instalado' },
    { field: 'diff_entregado', header: 'Dif. entregado' },
    { field: 'diff_instalado', header: 'Dif. instalado' },
    { field: 'pct_entregado', header: '% entregado' },
    { field: 'pct_instalado', header: '% instalado' },
    { field: 'estado', header: 'Estado' },
  ];

  const meta = {
    reporte: 'Producción por contrato',
    numero_contrato: rawNum && String(rawNum).trim() !== '' ? String(rawNum).trim() : null,
    documento: rawDoc && String(rawDoc).trim() !== '' ? String(rawDoc) : 'Todos',
    tipo_corte: rawTipoCorte && String(rawTipoCorte).trim() !== '' ? String(rawTipoCorte) : 'Todos',
    contrato: null,
    resumen: null,
  };

  const rows = [];
  // Sin filas de ejemplo: el front muestra encabezados; el SP rellenará.

  return { columns, rows, meta };
}

function normalizeSpError(err) {
  const msg =
    err && (err.sqlMessage || err.message)
      ? String(err.sqlMessage || err.message)
      : 'Error al ejecutar el procedimiento';
  const isNotFound = /contrato no existe/i.test(msg);
  return { msg, isNotFound };
}

function callReporteContrato(numeroContrato, cb) {
  db.query('CALL SP_REPORTE_CONTRATO(?)', [numeroContrato], (err, results) => {
    if (err) return cb(err);

    // mysql2 retorna: [rs0, rs1, rs2, ... okPackets]
    const contratoRows = Array.isArray(results?.[0]) ? results[0] : [];
    const detalleRows = Array.isArray(results?.[1]) ? results[1] : [];
    const resumenRows = Array.isArray(results?.[2]) ? results[2] : [];

    return cb(null, {
      contrato: contratoRows?.[0] ?? null,
      detalle: detalleRows ?? [],
      resumen: resumenRows?.[0] ?? null,
    });
  });
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

      const mappedRows = (data.detalle || []).map((r) => ({
        numero_contrato: data.contrato?.numero_contrato ?? numeroContrato,
        item: r.item ?? null,
        descripcion: r.descripcion ?? null,
        um: r.um ?? r.UM ?? null,
        contratado: r.contratado ?? null,
        entregado: r.entregado ?? null,
        instalado: r.instalado ?? null,
        diff_entregado: r.diff_entregado ?? null,
        diff_instalado: r.diff_instalado ?? null,
        pct_entregado: r.pct_entregado ?? null,
        pct_instalado: r.pct_instalado ?? null,
        estado: r.estado ?? null,
      }));

      return res.status(200).json({
        code: 1,
        message: 'OK',
        data: {
          columns,
          rows: mappedRows,
          meta: {
            ...meta,
            contrato: data.contrato,
            resumen: data.resumen,
          },
        },
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
    // Resumen: contratos en estado ACTIVO para 2 empresas (1 y 2),
    // acumulado por constructora/contrato y acumulado de saldos (SP_REPORTE_CARTERA).
    const buscar = req.query?.buscar ? String(req.query.buscar).trim() : null;
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
      { field: 'saldo', header: 'Saldo' },
      { field: 'constructora', header: 'Constructora' },
      { field: 'empresa_asociada', header: 'Empresa asociada' },
    ];

    const baseParams = [
      buscar && buscar !== '' ? buscar : null,
      'ACTIVO',
      null,
      null,
      null, // empresa_asociada (lo seteamos por empresa)
      constructora && constructora !== '' ? constructora : null,
      proyecto && proyecto !== '' ? proyecto : null,
    ];

    const [rowsEmp1, rowsEmp2] = await Promise.all([
      callConsultarContratosFullAsync([
        ...baseParams.slice(0, 4),
        '1',
        baseParams[5],
        baseParams[6],
      ]),
      callConsultarContratosFullAsync([
        ...baseParams.slice(0, 4),
        '2',
        baseParams[5],
        baseParams[6],
      ]),
    ]);

    const all = [...(rowsEmp1 || []), ...(rowsEmp2 || [])];

    // Dedupe por numero_contrato (un contrato puede salir repetido por detalle).
    const byContrato = new Map();
    for (const r of all) {
      const num = r?.numero_contrato ? String(r.numero_contrato).trim() : '';
      if (!num) continue;
      if (!byContrato.has(num)) byContrato.set(num, r);
    }

    // Para cada contrato, consultar saldo desde SP_REPORTE_CARTERA (resultset #2: resumen.saldo_contrato).
    const contratos = Array.from(byContrato.values());
    const carteraMap = new Map();
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
          empresas: ['1', '2'],
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

    try {
      const headers = columns.map((c) => c.header);
      const aoa = [headers];

      (data.detalle || []).forEach((row) => {
        const rowObj = {
          numero_contrato: data.contrato?.numero_contrato ?? numeroContrato,
          item: row.item ?? '',
          descripcion: row.descripcion ?? '',
          um: row.um ?? row.UM ?? '',
          contratado: row.contratado ?? '',
          entregado: row.entregado ?? '',
          instalado: row.instalado ?? '',
          diff_entregado: row.diff_entregado ?? '',
          diff_instalado: row.diff_instalado ?? '',
          pct_entregado: row.pct_entregado ?? '',
          pct_instalado: row.pct_instalado ?? '',
          estado: row.estado ?? '',
        };
        aoa.push(columns.map((c) => rowObj[c.field] ?? ''));
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
        aoa.push([]);
        aoa.push(['Resumen general', '']);
        aoa.push(['Total contratado', data.resumen.total_contratado ?? '']);
        aoa.push(['Total entregado', data.resumen.total_entregado ?? '']);
        aoa.push(['Total instalado', data.resumen.total_instalado ?? '']);
        aoa.push(['% entregado', data.resumen.pct_entregado ?? '']);
        aoa.push(['% instalado', data.resumen.pct_instalado ?? '']);
        aoa.push(['% pendiente', data.resumen.pct_pendiente ?? '']);
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Producción x contrato');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader(
        'Content-Disposition',
        `attachment; filename=informe-produccion-por-contrato-${numeroContrato}.xlsx`
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
};

module.exports = {
  getProductionByContractPreview,
  exportProductionByContract,
  getCarteraPreview,
  getObrasActivasPreview,
};
