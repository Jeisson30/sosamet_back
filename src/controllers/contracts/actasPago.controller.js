const db = require('../../config/db');
const {
  puedeEditarActasPago,
  puedeVerValoresContrato,
  aplicarRestriccionValores,
} = require('../../utils/permissions');

/** Editores de Actas de Pago (incl. Contabilidad) ven montos aquí. */
const withPagoValues = (user, payload) => {
  if (puedeEditarActasPago(user) || puedeVerValoresContrato(user)) return payload;
  return aplicarRestriccionValores(user, payload);
};

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

const requireEditor = (req, res) => {
  if (!puedeEditarActasPago(req.user)) {
    res.status(403).json({ mensaje: 'No tiene permiso para editar Actas de Pago.' });
    return false;
  }
  return true;
};

/** Prefijo por empresa asociada: SOSA / HIERROS / DMS (fallback PAGO). */
function prefixFromEmpresa(empresa) {
  const raw = String(empresa || '').trim();
  if (raw === '3') return 'DMS';
  if (raw === '2') return 'HIERROS';
  if (raw === '1') return 'SOSA';
  const n = raw.toUpperCase();
  if (n.includes('DMS')) return 'DMS';
  if (n.includes('HIERRO') || /\bHS\b/.test(n) || n.includes('H&S')) return 'HIERROS';
  if (n.includes('SOSAMET') || n.includes('SOSA')) return 'SOSA';
  return 'PAGO';
}

async function nextConsecutivo(empresa) {
  const prefix = prefixFromEmpresa(empresa);
  const rows = await queryAsync(
    `SELECT consecutivo FROM acta_pago
      WHERE consecutivo LIKE ?
      ORDER BY id DESC LIMIT 1`,
    [`${prefix}-%`]
  );
  const last = rows?.[0]?.consecutivo || '';
  const re = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  const m = String(last).match(re);
  const n = m ? Number(m[1]) + 1 : 1;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

async function assertConsecutivoLibre(consecutivo, excludeId = null) {
  const raw = String(consecutivo || '').trim().toUpperCase();
  if (!raw) return null;
  const params = [raw];
  let sql = `SELECT id FROM acta_pago WHERE UPPER(TRIM(consecutivo)) = ?`;
  if (excludeId) {
    sql += ` AND id <> ?`;
    params.push(excludeId);
  }
  sql += ` LIMIT 1`;
  const exists = await queryAsync(sql, params);
  if (exists?.length) {
    const err = new Error(`El consecutivo ${raw} ya existe.`);
    err.status = 409;
    throw err;
  }
  return raw;
}

async function resolveEmpresaNombre(idOrName) {
  const v = String(idOrName ?? '').trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return v;
  const rows = await queryAsync(
    `SELECT nombre_empresa FROM empresa WHERE id = ? LIMIT 1`,
    [Number(v)]
  );
  return rows?.[0]?.nombre_empresa || v;
}

async function pivotContratoByNumero(numeroContrato) {
  const rows = await queryAsync(
    `SELECT
        c.numerodoc,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'numero_contrato'
            THEN TRIM(c.valor_campo_doc) END) AS numero_contrato,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) IN ('empresa', 'constructora')
            THEN TRIM(c.valor_campo_doc) END) AS constructora,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'proyecto'
            THEN TRIM(c.valor_campo_doc) END) AS proyecto,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'tipo_contrato'
            THEN TRIM(c.valor_campo_doc) END) AS tipo_contrato,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'empresa_asociada'
            THEN TRIM(c.valor_campo_doc) END) AS empresa_asociada,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) IN ('descripcion', 'objeto')
            THEN TRIM(c.valor_campo_doc) END) AS descripcion
      FROM item_documentos c
      INNER JOIN item_documentos nc
        ON nc.numerodoc = c.numerodoc
       AND UPPER(TRIM(nc.tipo_doc)) = 'CONTRATO'
       AND LOWER(nc.nombre_campo_doc) = 'numero_contrato'
       AND TRIM(nc.valor_campo_doc) = ?
      WHERE UPPER(TRIM(c.tipo_doc)) = 'CONTRATO'
      GROUP BY c.numerodoc
      LIMIT 1`,
    [String(numeroContrato).trim()]
  );
  return rows?.[0] || null;
}

async function valorContratoFromNumerodoc(numerodoc) {
  if (!numerodoc) return 0;
  const [aiu, iva] = await Promise.all([
    queryAsync(
      `SELECT COALESCE(SUM(vr_total),0) AS t FROM aiu WHERE numdoc = ?`,
      [numerodoc]
    ),
    queryAsync(
      `SELECT COALESCE(SUM(vr_total),0) AS t FROM iva_pleno WHERE numdoc = ?`,
      [numerodoc]
    ),
  ]);
  return toNum(aiu?.[0]?.t) + toNum(iva?.[0]?.t);
}

/** Pagos que cuentan para acumulado / pagos anteriores. */
async function sumPagosContrato(numeroContrato, excludeId = null) {
  const params = [String(numeroContrato).trim()];
  let excl = '';
  if (excludeId) {
    excl = ' AND id <> ?';
    params.push(Number(excludeId));
  }
  const rows = await queryAsync(
    `SELECT COALESCE(SUM(valor_a_pagar),0) AS t
       FROM acta_pago
      WHERE TRIM(numero_contrato) = ?
        AND estado IN ('FACTURADO','PAGO')
        ${excl}`,
    params
  );
  return toNum(rows?.[0]?.t);
}

function calcDescuentos(valorActa, descuentosIn) {
  const list = Array.isArray(descuentosIn) ? descuentosIn : [];
  const clean = [];
  let total = 0;
  list.forEach((d, i) => {
    const concepto = String(d?.concepto || '').trim();
    if (!concepto) return;
    const tipo =
      String(d?.tipo || 'PORCENTAJE').toUpperCase() === 'VALOR'
        ? 'VALOR'
        : 'PORCENTAJE';
    const porcentaje = toNum(d?.porcentaje);
    let valor = toNum(d?.valor);
    if (tipo === 'PORCENTAJE') {
      valor = Number(((valorActa * porcentaje) / 100).toFixed(2));
    } else {
      valor = Number(valor.toFixed(2));
    }
    total += valor;
    clean.push({
      orden: i,
      concepto,
      tipo,
      porcentaje: tipo === 'PORCENTAJE' ? porcentaje : 0,
      valor,
    });
  });
  total = Number(total.toFixed(2));
  const valor_a_pagar = Number(Math.max(0, valorActa - total).toFixed(2));
  return { descuentos: clean, total_descuentos: total, valor_a_pagar };
}

async function memoriaTieneActaActiva(idMemoria, excludeActaId = null) {
  const params = [Number(idMemoria)];
  let excl = '';
  if (excludeActaId) {
    excl = ' AND id <> ?';
    params.push(Number(excludeActaId));
  }
  const rows = await queryAsync(
    `SELECT id FROM acta_pago
      WHERE id_memoria = ?
        AND estado <> 'ANULADA'
        ${excl}
      LIMIT 1`,
    params
  );
  return rows?.[0]?.id || null;
}

/**
 * GET /memorias-disponibles
 * Memorias GUARDADA|FINALIZADA sin acta activa.
 */
const listarMemoriasDisponibles = async (req, res) => {
  try {
    const constructora = String(req.query.constructora || '').trim();
    const proyecto = String(req.query.proyecto || '').trim();
    const numero_contrato = String(req.query.numero_contrato || '').trim();
    const tipo_documento = String(req.query.tipo_documento || '').trim();
    const acta_no = String(req.query.acta_no || req.query.memoria_consecutivo || '').trim();

    const where = [`m.estado IN ('GUARDADA','FINALIZADA')`];
    const params = [];

    if (constructora) {
      where.push(`TRIM(IFNULL(m.constructora,'')) = ?`);
      params.push(constructora);
    }
    if (proyecto) {
      where.push(`TRIM(IFNULL(m.proyecto,'')) = ?`);
      params.push(proyecto);
    }
    if (numero_contrato) {
      where.push(`TRIM(IFNULL(m.numero_contrato,'')) = ?`);
      params.push(numero_contrato);
    }
    if (tipo_documento) {
      where.push(`TRIM(IFNULL(m.tipo_documento,'')) = ?`);
      params.push(tipo_documento);
    }
    if (acta_no) {
      where.push(`m.consecutivo LIKE CONCAT('%', ?, '%')`);
      params.push(acta_no);
    }

    where.push(`NOT EXISTS (
      SELECT 1 FROM acta_pago ap
       WHERE ap.id_memoria = m.id AND ap.estado <> 'ANULADA'
    )`);

    const rows = await queryAsync(
      `SELECT m.id, m.consecutivo, m.numero_contrato, m.numerodoc_contrato,
              m.constructora, m.proyecto, m.tipo_documento, m.empresa_asociada,
              m.fecha_acta, m.estado, m.valor_neto, m.subtotal
         FROM memoria_facturacion m
        WHERE ${where.join(' AND ')}
        ORDER BY m.id DESC
        LIMIT 100`,
      params
    );

    const data = [];
    for (const row of rows || []) {
      const empresa = await resolveEmpresaNombre(row.empresa_asociada);
      data.push({ ...row, empresa_asociada: empresa });
    }

    return res.status(200).json(withPagoValues(req.user, { data }));
  } catch (error) {
    console.error('actasPago.listarMemoriasDisponibles:', error);
    return res.status(500).json({
      mensaje: 'Error al buscar memorias disponibles.',
      error: error.message,
    });
  }
};

/**
 * GET /contexto?id_memoria=
 * KPIs + snapshot para armar el pago.
 */
const getContexto = async (req, res) => {
  try {
    const id_memoria = Number(req.query.id_memoria);
    if (!Number.isFinite(id_memoria) || id_memoria <= 0) {
      return res.status(400).json({ mensaje: 'id_memoria requerido.' });
    }

    const memRows = await queryAsync(
      `SELECT * FROM memoria_facturacion WHERE id = ? LIMIT 1`,
      [id_memoria]
    );
    const mem = memRows?.[0];
    if (!mem) return res.status(404).json({ mensaje: 'Memoria no encontrada.' });
    if (!['GUARDADA', 'FINALIZADA'].includes(String(mem.estado))) {
      return res.status(400).json({
        mensaje: 'Solo memorias GUARDADA o FINALIZADA pueden pagarse.',
      });
    }

    const activa = await memoriaTieneActaActiva(id_memoria);
    if (activa) {
      return res.status(409).json({
        mensaje: 'Esta memoria ya tiene un Acta de Pago activa.',
        id_acta_pago: activa,
      });
    }

    const cab = await pivotContratoByNumero(mem.numero_contrato);
    const valor_contrato = await valorContratoFromNumerodoc(
      mem.numerodoc_contrato || cab?.numerodoc
    );
    const valor_acta = toNum(mem.valor_neto);
    const pagos_anteriores = await sumPagosContrato(mem.numero_contrato);
    const valor_acumulado = pagos_anteriores;
    // Saldo por pagar (KPI) = valor contrato − acumulado − valor acta.
    const saldo_por_pagar = Number(
      Math.max(0, valor_contrato - valor_acumulado - valor_acta).toFixed(2)
    );

    const empresa = await resolveEmpresaNombre(
      mem.empresa_asociada || cab?.empresa_asociada
    );

    return res.status(200).json(
      withPagoValues(req.user, {
        memoria: {
          id: mem.id,
          consecutivo: mem.consecutivo,
          numero_contrato: mem.numero_contrato,
          numerodoc_contrato: mem.numerodoc_contrato,
          constructora: mem.constructora || cab?.constructora,
          proyecto: mem.proyecto || cab?.proyecto,
          tipo_documento: mem.tipo_documento || cab?.tipo_contrato,
          empresa_asociada: empresa,
          fecha_acta: mem.fecha_acta,
          estado: mem.estado,
          valor_neto: valor_acta,
        },
        resumen: {
          valor_contrato,
          valor_acumulado,
          valor_acta,
          saldo_por_pagar,
          pagos_anteriores,
        },
        siguiente_consecutivo: await nextConsecutivo(empresa),
      })
    );
  } catch (error) {
    console.error('actasPago.getContexto:', error);
    return res.status(500).json({
      mensaje: 'Error al cargar contexto de Acta de Pago.',
      error: error.message,
    });
  }
};

const listar = async (req, res) => {
  try {
    const buscar = String(req.query.buscar || '').trim();
    const estado = String(req.query.estado || '').trim().toUpperCase();
    const constructora = String(req.query.constructora || '').trim();
    const proyecto = String(req.query.proyecto || '').trim();
    const empresa = String(req.query.empresa_asociada || '').trim();
    const tipo_documento_pago = String(req.query.tipo_documento_pago || '').trim();
    const tipo_pago = String(req.query.tipo_pago || '').trim();
    const fechaDesde = String(req.query.fecha_desde || '').trim();
    const fechaHasta = String(req.query.fecha_hasta || '').trim();

    const where = ['1=1'];
    const params = [];

    if (buscar) {
      where.push(`(
        consecutivo LIKE CONCAT('%', ?, '%')
        OR numero_contrato LIKE CONCAT('%', ?, '%')
        OR constructora LIKE CONCAT('%', ?, '%')
        OR proyecto LIKE CONCAT('%', ?, '%')
        OR IFNULL(memoria_consecutivo,'') LIKE CONCAT('%', ?, '%')
        OR IFNULL(empresa_asociada,'') LIKE CONCAT('%', ?, '%')
      )`);
      params.push(buscar, buscar, buscar, buscar, buscar, buscar);
    }
    if (constructora) {
      where.push(`TRIM(IFNULL(constructora,'')) = ?`);
      params.push(constructora);
    }
    if (proyecto) {
      where.push(`TRIM(IFNULL(proyecto,'')) = ?`);
      params.push(proyecto);
    }
    if (empresa) {
      where.push(`TRIM(IFNULL(empresa_asociada,'')) = ?`);
      params.push(empresa);
    }
    if (tipo_documento_pago) {
      where.push(`TRIM(IFNULL(tipo_documento_pago,'')) = ?`);
      params.push(tipo_documento_pago);
    }
    if (tipo_pago) {
      where.push(`TRIM(IFNULL(tipo_pago,'')) = ?`);
      params.push(tipo_pago);
    }
    if (fechaDesde) {
      where.push(`fecha_emision >= ?`);
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      where.push(`fecha_emision <= ?`);
      params.push(fechaHasta);
    }
    if (estado) {
      where.push(`estado = ?`);
      params.push(estado);
    }

    const rows = await queryAsync(
      `SELECT id, consecutivo, id_memoria, memoria_consecutivo, numero_contrato,
              constructora, proyecto, empresa_asociada, tipo_documento_pago,
              tipo_pago, estado, fecha_emision, fecha_pago, valor_a_pagar,
              valor_acta, fecha_creacion
         FROM acta_pago
        WHERE ${where.join(' AND ')}
        ORDER BY COALESCE(fecha_emision, fecha_creacion) DESC, id DESC
        LIMIT 300`,
      params
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const data = [];
    for (const row of rows || []) {
      let dias = null;
      const fe = row.fecha_emision || row.fecha_creacion;
      if (fe) {
        const d = new Date(fe);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(0, 0, 0, 0);
          dias = Math.max(0, Math.round((today - d) / 86400000));
        }
      }
      data.push({
        ...row,
        empresa_asociada: await resolveEmpresaNombre(row.empresa_asociada),
        tiempo_transcurrido_dias: dias,
      });
    }

    return res.status(200).json(withPagoValues(req.user, { data }));
  } catch (error) {
    console.error('actasPago.listar:', error);
    return res.status(500).json({
      mensaje: 'Error al listar Actas de Pago.',
      error: error.message,
    });
  }
};

const obtener = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ mensaje: 'Id inválido.' });
    }
    const headers = await queryAsync(
      `SELECT * FROM acta_pago WHERE id = ? LIMIT 1`,
      [id]
    );
    const headerRaw = headers?.[0];
    if (!headerRaw) {
      return res.status(404).json({ mensaje: 'Acta de Pago no encontrada.' });
    }
    const descuentos = await queryAsync(
      `SELECT * FROM acta_pago_descuento WHERE id_acta_pago = ? ORDER BY orden, id`,
      [id]
    );
    const header = {
      ...headerRaw,
      empresa_asociada: await resolveEmpresaNombre(headerRaw.empresa_asociada),
    };
    return res.status(200).json(
      withPagoValues(req.user, { header, descuentos: descuentos || [] })
    );
  } catch (error) {
    console.error('actasPago.obtener:', error);
    return res.status(500).json({
      mensaje: 'Error al obtener Acta de Pago.',
      error: error.message,
    });
  }
};

/**
 * POST body: { id?, cabecera, descuentos[] }
 * Guarda en EN_REVISION.
 */
const guardar = async (req, res) => {
  if (!requireEditor(req, res)) return;
  try {
    const body = req.body || {};
    const cab = body.cabecera || {};
    const idExistente = Number(body.id || cab.id || 0) || null;
    const id_memoria = Number(cab.id_memoria);
    if (!Number.isFinite(id_memoria) || id_memoria <= 0) {
      return res.status(400).json({ mensaje: 'Debe seleccionar una memoria.' });
    }

    const memRows = await queryAsync(
      `SELECT * FROM memoria_facturacion WHERE id = ? LIMIT 1`,
      [id_memoria]
    );
    const mem = memRows?.[0];
    if (!mem) return res.status(404).json({ mensaje: 'Memoria no encontrada.' });
    if (!['GUARDADA', 'FINALIZADA'].includes(String(mem.estado))) {
      return res.status(400).json({
        mensaje: 'La memoria no está disponible para pago.',
      });
    }

    const otra = await memoriaTieneActaActiva(id_memoria, idExistente);
    if (otra) {
      return res.status(409).json({
        mensaje: 'Esta memoria ya tiene un Acta de Pago activa.',
        id_acta_pago: otra,
      });
    }

    if (idExistente) {
      const cur = await queryAsync(
        `SELECT estado FROM acta_pago WHERE id = ? LIMIT 1`,
        [idExistente]
      );
      const est = cur?.[0]?.estado;
      if (!est) {
        return res.status(404).json({ mensaje: 'Acta de Pago no encontrada.' });
      }
      if (est !== 'EN_REVISION') {
        return res.status(400).json({
          mensaje: 'Solo se pueden editar actas en revisión.',
        });
      }
    }

    const valor_acta = toNum(cab.valor_acta != null ? cab.valor_acta : mem.valor_neto);
    const { descuentos, total_descuentos, valor_a_pagar } = calcDescuentos(
      valor_acta,
      body.descuentos
    );

    const cabContrato = await pivotContratoByNumero(mem.numero_contrato);
    const valor_contrato =
      cab.valor_contrato != null
        ? toNum(cab.valor_contrato)
        : await valorContratoFromNumerodoc(
            mem.numerodoc_contrato || cabContrato?.numerodoc
          );
    const pagos_anteriores = await sumPagosContrato(
      mem.numero_contrato,
      idExistente
    );
    // KPI / resumen valores: contrato − acumulado − valor acta.
    const saldo_por_pagar = Number(
      Math.max(0, valor_contrato - pagos_anteriores - valor_acta).toFixed(2)
    );

    const tipo_documento_pago = String(cab.tipo_documento_pago || '').trim();
    const tipo_pago = String(cab.tipo_pago || 'Avance de Obra').trim();
    const observaciones = String(cab.observaciones || '').trim().slice(0, 500);
    const fecha_emision =
      cab.fecha_emision ||
      new Date().toISOString().slice(0, 10);
    const recibo_caja = String(cab.recibo_caja || '').trim() || null;
    const fecha_pago = String(cab.fecha_pago || '').trim() || null;
    let estado = String(cab.estado || 'EN_REVISION').trim().toUpperCase();
    if (!['EN_REVISION', 'FACTURADO', 'PAGO'].includes(estado)) {
      estado = 'EN_REVISION';
    }
    if (estado === 'PAGO' && (!recibo_caja || !fecha_pago)) {
      return res.status(400).json({
        mensaje: 'Para estado Pago indique recibo de caja y fecha de pago.',
      });
    }
    const id_usuario = req.user?.id_usuario || req.user?.id || null;
    const empresa =
      (await resolveEmpresaNombre(mem.empresa_asociada)) ||
      mem.empresa_asociada;

    let id = idExistente;
    let consecutivo = String(cab.consecutivo || '').trim();

    if (id) {
      if (consecutivo) {
        consecutivo = await assertConsecutivoLibre(consecutivo, id);
      }
      await queryAsync(
        `UPDATE acta_pago SET
            consecutivo = COALESCE(?, consecutivo),
            tipo_documento_pago = ?,
            tipo_pago = ?,
            estado = ?,
            fecha_emision = ?,
            recibo_caja = ?,
            fecha_pago = ?,
            valor_contrato = ?,
            valor_acta = ?,
            total_descuentos = ?,
            valor_a_pagar = ?,
            pagos_anteriores = ?,
            saldo_por_pagar = ?,
            observaciones = ?,
            empresa_asociada = ?,
            constructora = ?,
            proyecto = ?,
            tipo_documento = ?,
            numero_contrato = ?,
            numerodoc_contrato = ?,
            memoria_consecutivo = ?
          WHERE id = ?`,
        [
          consecutivo || null,
          tipo_documento_pago || null,
          tipo_pago || null,
          estado,
          fecha_emision,
          recibo_caja,
          fecha_pago,
          valor_contrato,
          valor_acta,
          total_descuentos,
          valor_a_pagar,
          pagos_anteriores,
          saldo_por_pagar,
          observaciones || null,
          empresa,
          mem.constructora,
          mem.proyecto,
          mem.tipo_documento,
          mem.numero_contrato,
          mem.numerodoc_contrato,
          mem.consecutivo,
          id,
        ]
      );
      await queryAsync(`DELETE FROM acta_pago_descuento WHERE id_acta_pago = ?`, [
        id,
      ]);
    } else {
      consecutivo =
        (await assertConsecutivoLibre(consecutivo)) ||
        (await nextConsecutivo(empresa));
      const ins = await queryAsync(
        `INSERT INTO acta_pago (
            consecutivo, id_memoria, memoria_consecutivo, numerodoc_contrato,
            numero_contrato, constructora, proyecto, tipo_documento,
            empresa_asociada, tipo_documento_pago, tipo_pago, estado,
            fecha_emision, recibo_caja, fecha_pago,
            valor_contrato, valor_acta, total_descuentos,
            valor_a_pagar, pagos_anteriores, saldo_por_pagar, observaciones,
            id_usuario
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          consecutivo,
          id_memoria,
          mem.consecutivo,
          mem.numerodoc_contrato,
          mem.numero_contrato,
          mem.constructora,
          mem.proyecto,
          mem.tipo_documento,
          empresa,
          tipo_documento_pago || null,
          tipo_pago || null,
          estado,
          fecha_emision,
          recibo_caja,
          fecha_pago,
          valor_contrato,
          valor_acta,
          total_descuentos,
          valor_a_pagar,
          pagos_anteriores,
          saldo_por_pagar,
          observaciones || null,
          id_usuario,
        ]
      );
      id = ins.insertId;
    }

    for (const d of descuentos) {
      await queryAsync(
        `INSERT INTO acta_pago_descuento
           (id_acta_pago, orden, concepto, tipo, porcentaje, valor)
         VALUES (?,?,?,?,?,?)`,
        [id, d.orden, d.concepto, d.tipo, d.porcentaje, d.valor]
      );
    }

    return res.status(200).json({
      mensaje: 'Acta de Pago guardada.',
      data: {
        id,
        consecutivo,
        estado,
        valor_a_pagar,
        total_descuentos,
        saldo_por_pagar,
      },
    });
  } catch (error) {
    if (error?.status === 409) {
      return res.status(409).json({ mensaje: error.message });
    }
    console.error('actasPago.guardar:', error);
    return res.status(500).json({
      mensaje: 'Error al guardar Acta de Pago.',
      error: error.message,
    });
  }
};

const finalizar = async (req, res) => {
  if (!requireEditor(req, res)) return;
  try {
    const id = Number(req.params.id);
    const rows = await queryAsync(
      `SELECT id, estado FROM acta_pago WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ mensaje: 'No encontrada.' });
    if (row.estado !== 'EN_REVISION') {
      return res.status(400).json({
        mensaje: 'Solo se finalizan actas en revisión (pasan a Facturado).',
      });
    }
    await queryAsync(
      `UPDATE acta_pago SET estado = 'FACTURADO' WHERE id = ?`,
      [id]
    );
    return res.status(200).json({ mensaje: 'Acta de Pago facturada.', estado: 'FACTURADO' });
  } catch (error) {
    console.error('actasPago.finalizar:', error);
    return res.status(500).json({ mensaje: 'Error al finalizar.', error: error.message });
  }
};

/** POST /:id/marcar-pago { recibo_caja, fecha_pago } */
const marcarPago = async (req, res) => {
  if (!requireEditor(req, res)) return;
  try {
    const id = Number(req.params.id);
    const recibo_caja = String(req.body?.recibo_caja || '').trim();
    const fecha_pago = String(req.body?.fecha_pago || '').trim();
    if (!recibo_caja || !fecha_pago) {
      return res.status(400).json({
        mensaje: 'Recibo de caja y fecha de pago son obligatorios.',
      });
    }
    const rows = await queryAsync(
      `SELECT id, estado FROM acta_pago WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ mensaje: 'No encontrada.' });
    if (!['FACTURADO', 'EN_REVISION'].includes(row.estado)) {
      return res.status(400).json({
        mensaje: 'Solo actas Facturado (o En Revisión) pueden marcarse como Pago.',
      });
    }
    await queryAsync(
      `UPDATE acta_pago
          SET estado = 'PAGO', recibo_caja = ?, fecha_pago = ?
        WHERE id = ?`,
      [recibo_caja, fecha_pago, id]
    );
    return res.status(200).json({ mensaje: 'Acta marcada como Pago.', estado: 'PAGO' });
  } catch (error) {
    console.error('actasPago.marcarPago:', error);
    return res.status(500).json({ mensaje: 'Error al marcar pago.', error: error.message });
  }
};

const anular = async (req, res) => {
  if (!requireEditor(req, res)) return;
  try {
    const id = Number(req.params.id);
    const rows = await queryAsync(
      `SELECT id, estado FROM acta_pago WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ mensaje: 'No encontrada.' });
    if (row.estado === 'ANULADA') {
      return res.status(400).json({ mensaje: 'Ya está anulada.' });
    }
    await queryAsync(
      `UPDATE acta_pago SET estado = 'ANULADA' WHERE id = ?`,
      [id]
    );
    return res.status(200).json({ mensaje: 'Acta de Pago anulada.' });
  } catch (error) {
    console.error('actasPago.anular:', error);
    return res.status(500).json({ mensaje: 'Error al anular.', error: error.message });
  }
};

const eliminar = async (req, res) => {
  if (!requireEditor(req, res)) return;
  try {
    const id = Number(req.params.id);
    const rows = await queryAsync(
      `SELECT id, estado FROM acta_pago WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ mensaje: 'No encontrada.' });
    if (!['EN_REVISION', 'ANULADA'].includes(row.estado)) {
      return res.status(400).json({
        mensaje: 'Solo se eliminan actas En Revisión o Anuladas. Use Anular para liberar la memoria.',
      });
    }
    await queryAsync(`DELETE FROM acta_pago WHERE id = ?`, [id]);
    return res.status(200).json({ mensaje: 'Acta de Pago eliminada.' });
  } catch (error) {
    console.error('actasPago.eliminar:', error);
    return res.status(500).json({ mensaje: 'Error al eliminar.', error: error.message });
  }
};

module.exports = {
  listarMemoriasDisponibles,
  getContexto,
  listar,
  obtener,
  guardar,
  finalizar,
  marcarPago,
  anular,
  eliminar,
};
