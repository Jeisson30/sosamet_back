const db = require('../../config/db');
const { normalizarCabeceraEntrega } = require('./inventario.controller');

const ESTADOS_ENTREGA = ['PRESTAMO', 'VENCIDA', 'PARCIAL', 'DEVUELTO', 'DANADO', 'EXTRAVIADO', 'NO_REQUIERE', 'ANULADO'];
const MAX_FILAS = 5000;

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => (err ? reject(err) : resolve(results)));
  });

const primerResultado = (results) =>
  (Array.isArray(results) ? results.find((r) => Array.isArray(r)) : null)?.[0] || null;

const textoONull = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const enteroONull = (v) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isInteger(n) && n > 0 ? n : null;
};

const numeroONull = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const SELECT_CONSULTA = `
  SELECT v.*,
         DATE_FORMAT(v.fecha_movimiento, '%Y-%m-%d') AS fecha_entrega,
         DATE_FORMAT(v.fecha_prevista_devolucion, '%Y-%m-%d') AS fecha_prevista,
         DATE_FORMAT(v.ultima_devolucion, '%Y-%m-%d') AS fecha_ultima_devolucion
    FROM vw_inv_entrega_consulta v`;

/**
 * Consulta Entrega y Devolución (un elemento por fila, más reciente primero).
 * Filtros: buscar, fecha_desde, fecha_hasta (fecha de entrega), id_constructora, id_proyecto, concepto, estado.
 */
const listarEntregas = async (req, res) => {
  const q = req.query || {};
  const where = [];
  const params = [];

  for (const [param, op] of [['fecha_desde', '>='], ['fecha_hasta', '<=']]) {
    const f = textoONull(q[param]);
    if (!f) continue;
    if (!esFecha(f)) return res.status(400).json({ codigo: 0, mensaje: `${param} debe ser AAAA-MM-DD.` });
    where.push(`DATE(v.fecha_movimiento) ${op} ?`);
    params.push(f);
  }
  if (q.fecha_desde && q.fecha_hasta && String(q.fecha_desde) > String(q.fecha_hasta)) {
    return res.status(400).json({ codigo: 0, mensaje: 'La fecha "Desde" no puede ser mayor que "Hasta".' });
  }

  const idConstructora = enteroONull(q.id_constructora);
  if (idConstructora) {
    where.push('v.id_constructora = ?');
    params.push(idConstructora);
  }
  const idProyecto = enteroONull(q.id_proyecto);
  if (idProyecto) {
    where.push('v.id_proyecto = ?');
    params.push(idProyecto);
  }
  const concepto = textoONull(q.concepto)?.toUpperCase();
  if (concepto) {
    where.push('v.concepto = ?');
    params.push(concepto);
  }
  const estado = textoONull(q.estado)?.toUpperCase();
  if (estado) {
    if (!ESTADOS_ENTREGA.includes(estado)) {
      return res.status(400).json({ codigo: 0, mensaje: `Estado inválido. Use: ${ESTADOS_ENTREGA.join(', ')}.` });
    }
    where.push('v.estado_entrega = ?');
    params.push(estado);
  }
  const buscar = textoONull(q.buscar)?.slice(0, 150);
  if (buscar) {
    const campos = [
      'v.consecutivo', 'v.entregado_a', 'v.codigo_material', 'v.descripcion', 'v.proyecto', 'v.constructora',
      'v.numerodoc_ref', 'v.ubicacion_entrega', 'v.concepto', 'v.concepto_detalle', 'v.estado_material',
    ];
    where.push(`(${campos.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    params.push(...campos.map(() => `%${buscar}%`));
  }

  try {
    const rows = await query(
      `${SELECT_CONSULTA}
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY v.fecha_movimiento DESC, v.id_movimiento DESC, v.linea
       LIMIT ${MAX_FILAS}`,
      params
    );
    return res.status(200).json({ codigo: 1, mensaje: 'OK', data: rows });
  } catch (err) {
    console.error('vw_inv_entrega_consulta error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al consultar las entregas.', error: err.message });
  }
};

const ENCABEZADO = `
  SELECT m.id_movimiento, m.tipo_movimiento, m.consecutivo,
         DATE_FORMAT(m.fecha_movimiento, '%Y-%m-%d') AS fecha,
         m.fecha_movimiento,
         m.concepto, m.concepto_detalle, m.area, m.area_detalle,
         m.id_usuario_entregado, m.entregado_a,
         m.id_constructora, co.nombre AS constructora, m.id_proyecto, pr.nombre AS proyecto,
         m.tipo_doc_ref, m.numerodoc_ref, m.ubicacion_entrega, m.tipo_entrega,
         DATE_FORMAT(m.fecha_prevista_devolucion, '%Y-%m-%d') AS fecha_prevista,
         m.autoriza, m.transporte, m.observaciones, m.id_empresa, m.id_movimiento_origen, m.concepto_devolucion,
         m.total_items, m.estado, m.usuario_crea, m.fecha_creacion,
         m.usuario_anula, m.fecha_anulacion, m.motivo_anulacion
    FROM inv_movimiento m
    LEFT JOIN constructoras co ON co.id_constructora = m.id_constructora
    LEFT JOIN proyectos_constructoras pr ON pr.id_proyecto = m.id_proyecto`;

const ADJUNTOS = `
  SELECT id_adjunto, id_movimiento, nombre_original, ruta, tipo_mime
    FROM inv_movimiento_adjunto
   WHERE id_movimiento IN (?) AND estado = 'ACTIVO'
   ORDER BY id_adjunto`;

/** Visualizar: encabezado, elementos con estado, fotos y cada devolución (elementos + fotos). */
const detalleEntrega = async (req, res) => {
  const id = enteroONull(req.params.idMovimiento);
  if (!id) return res.status(400).json({ codigo: 0, mensaje: 'id_movimiento inválido.' });

  try {
    const [entrega] = await query(`${ENCABEZADO} WHERE m.id_movimiento = ? AND m.tipo_movimiento = 'DESPACHO'`, [id]);
    if (!entrega) return res.status(404).json({ codigo: 0, mensaje: 'La entrega no existe.' });

    const items = await query(`${SELECT_CONSULTA} WHERE v.id_movimiento = ? ORDER BY v.linea`, [id]);
    const devoluciones = await query(
      `${ENCABEZADO} WHERE m.id_movimiento_origen = ? AND m.tipo_movimiento = 'DEVOLUCION'
       ORDER BY m.fecha_movimiento, m.id_movimiento`,
      [id]
    );
    const idsDev = devoluciones.map((d) => d.id_movimiento);
    const itemsDev = idsDev.length
      ? await query(
          `SELECT id_detalle, id_movimiento, linea, id_detalle_origen, codigo_material, descripcion, cantidad, um,
                  ancho, alto, ubicacion, estado_material, observaciones, signo, estado
             FROM inv_movimiento_detalle
            WHERE id_movimiento IN (?) AND estado <> 'ELIMINADO'
            ORDER BY id_movimiento, linea`,
          [idsDev]
        )
      : [];
    const adjuntos = await query(ADJUNTOS, [[id, ...idsDev]]);

    return res.status(200).json({
      codigo: 1,
      mensaje: 'OK',
      data: {
        entrega,
        items,
        adjuntos: adjuntos.filter((a) => a.id_movimiento === id),
        devoluciones: devoluciones.map((d) => ({
          ...d,
          items: itemsDev.filter((it) => it.id_movimiento === d.id_movimiento),
          adjuntos: adjuntos.filter((a) => a.id_movimiento === d.id_movimiento),
        })),
      },
    });
  } catch (err) {
    console.error('detalle entrega error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al consultar la entrega.', error: err.message });
  }
};

/** Editar entrega: encabezado + ancho/alto/estado/observaciones de sus elementos (SP_INV_EDITAR_ENTREGA). */
const editarEntrega = async (req, res) => {
  const id = enteroONull(req.params.idMovimiento);
  if (!id) return res.status(400).json({ codigo: 0, mensaje: 'id_movimiento inválido.' });

  const body = req.body || {};
  const { cab, error } = normalizarCabeceraEntrega(body, []);
  if (error) return res.status(400).json({ codigo: 0, mensaje: error });
  const observaciones = textoONull(body.observaciones);
  if (observaciones && observaciones.length > 500) {
    return res.status(400).json({ codigo: 0, mensaje: 'observaciones supera 500 caracteres.' });
  }

  const itemsRaw = Array.isArray(body.items) ? body.items : [];
  const items = [];
  for (let i = 0; i < itemsRaw.length; i++) {
    const raw = itemsRaw[i] || {};
    const linea = i + 1;
    const idDetalle = enteroONull(raw.id_detalle);
    if (!idDetalle) return res.status(400).json({ codigo: 0, mensaje: `Elemento ${linea}: id_detalle inválido.` });
    const ancho = numeroONull(raw.ancho);
    const alto = numeroONull(raw.alto);
    if (Number.isNaN(ancho) || Number.isNaN(alto) || ancho < 0 || alto < 0) {
      return res.status(400).json({ codigo: 0, mensaje: `Elemento ${linea}: ancho / alto inválido.` });
    }
    const estado = textoONull(raw.estado_material);
    const obs = textoONull(raw.observaciones);
    if (estado && estado.length > 100) return res.status(400).json({ codigo: 0, mensaje: `Elemento ${linea}: estado supera 100 caracteres.` });
    if (obs && obs.length > 500) return res.status(400).json({ codigo: 0, mensaje: `Elemento ${linea}: observaciones supera 500 caracteres.` });
    items.push({ id_detalle: idDetalle, ancho, alto, estado_material: estado, observaciones: obs });
  }

  const cabecera = {
    fecha_movimiento: cab.fecha_movimiento,
    concepto: cab.concepto,
    concepto_detalle: cab.concepto_detalle,
    area: cab.area,
    area_detalle: cab.area_detalle,
    id_usuario_entregado: cab.id_usuario_entregado,
    id_constructora: enteroONull(body.id_constructora),
    id_proyecto: enteroONull(body.id_proyecto),
    tipo_doc_ref: textoONull(body.tipo_doc_ref),
    numerodoc_ref: textoONull(body.numerodoc_ref),
    ubicacion_entrega: cab.ubicacion_entrega,
    tipo_entrega: cab.tipo_entrega,
    fecha_prevista_devolucion: cab.fecha_prevista_devolucion,
    autoriza: cab.autoriza,
    transporte: cab.transporte,
    observaciones,
  };

  try {
    const r = primerResultado(
      await query('CALL SP_INV_EDITAR_ENTREGA(?, ?, ?, ?)', [
        id,
        req.user?.id_usuario ?? null,
        JSON.stringify(cabecera),
        JSON.stringify(items),
      ])
    );
    const codigo = Number(r?.codigo);
    if (codigo === 1) return res.status(200).json({ codigo, mensaje: r.mensaje });
    return res.status(codigo === 0 ? 400 : 500).json({
      codigo: Number.isNaN(codigo) ? -1 : codigo,
      mensaje: r?.mensaje || 'No se pudo editar la entrega.',
    });
  } catch (err) {
    console.error('SP_INV_EDITAR_ENTREGA error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al editar la entrega.', error: err.message });
  }
};

module.exports = { listarEntregas, detalleEntrega, editarEntrega };
