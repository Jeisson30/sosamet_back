const db = require('../../config/db');

const MAX_ITEMS = 500;
const ESTADOS_DEVOLUCION = ['PRESTAMO', 'VENCIDA', 'PARCIAL', 'DEVUELTO'];

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

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Entregas (DESPACHO activo, requiere devolución) con sus cantidades por devolver.
 * estado_devolucion: DEVUELTO (nada pendiente) > VENCIDA (hoy > fecha prevista) > PARCIAL > PRESTAMO.
 */
const SQL_ENTREGAS = `
  SELECT x.*,
         CASE
           WHEN x.cantidad_pendiente <= 0 THEN 'DEVUELTO'
           WHEN x.fecha_prevista_devolucion IS NOT NULL AND CURDATE() > x.fecha_prevista_devolucion THEN 'VENCIDA'
           WHEN x.cantidad_devuelta > 0 THEN 'PARCIAL'
           ELSE 'PRESTAMO'
         END AS estado_devolucion
    FROM (
      SELECT m.id_movimiento,
             m.consecutivo,
             DATE_FORMAT(m.fecha_movimiento, '%Y-%m-%d') AS fecha_entrega,
             m.concepto,
             m.concepto_detalle,
             m.area,
             m.area_detalle,
             m.id_usuario_entregado,
             m.entregado_a,
             m.id_constructora,
             co.nombre AS constructora,
             m.id_proyecto,
             pr.nombre AS proyecto,
             m.ubicacion_entrega,
             m.tipo_doc_ref,
             m.numerodoc_ref,
             m.id_empresa,
             m.autoriza AS autoriza_entrega,
             m.observaciones AS observaciones_entrega,
             DATE_FORMAT(m.fecha_prevista_devolucion, '%Y-%m-%d') AS fecha_prevista_devolucion,
             DATEDIFF(CURDATE(), DATE(m.fecha_movimiento)) AS dias_transcurridos,
             v.total_lineas,
             v.cantidad_entregada,
             v.cantidad_devuelta,
             v.cantidad_pendiente
        FROM (
          SELECT id_movimiento,
                 COUNT(*) AS total_lineas,
                 SUM(cantidad_entregada) AS cantidad_entregada,
                 SUM(cantidad_devuelta) AS cantidad_devuelta,
                 SUM(GREATEST(cantidad_pendiente, 0)) AS cantidad_pendiente
            FROM vw_inv_entrega_devolucion
           GROUP BY id_movimiento
        ) v
       INNER JOIN inv_movimiento m ON m.id_movimiento = v.id_movimiento
        LEFT JOIN constructoras co ON co.id_constructora = m.id_constructora
        LEFT JOIN proyectos_constructoras pr ON pr.id_proyecto = m.id_proyecto
    ) x`;

/** Buscar Entregas: ?buscar=&estado=PRESTAMO|VENCIDA|PARCIAL|DEVUELTO (sin estado = todas las pendientes). */
const listarEntregasPorDevolver = async (req, res) => {
  const where = [];
  const params = [];

  const estado = textoONull(req.query?.estado)?.toUpperCase() ?? null;
  if (estado && !ESTADOS_DEVOLUCION.includes(estado)) {
    return res.status(400).json({ codigo: 0, mensaje: `Estado inválido. Use: ${ESTADOS_DEVOLUCION.join(', ')}.` });
  }
  if (estado === 'DEVUELTO') {
    where.push('x.cantidad_pendiente <= 0');
  } else {
    where.push('x.cantidad_pendiente > 0');
    if (estado === 'VENCIDA') {
      where.push('x.fecha_prevista_devolucion IS NOT NULL AND CURDATE() > x.fecha_prevista_devolucion');
    } else if (estado === 'PARCIAL' || estado === 'PRESTAMO') {
      where.push('(x.fecha_prevista_devolucion IS NULL OR CURDATE() <= x.fecha_prevista_devolucion)');
      where.push(estado === 'PARCIAL' ? 'x.cantidad_devuelta > 0' : 'x.cantidad_devuelta <= 0');
    }
  }

  const buscar = textoONull(req.query?.buscar)?.slice(0, 150);
  if (buscar) {
    const like = `%${buscar}%`;
    where.push(
      `(x.consecutivo LIKE ? OR x.entregado_a LIKE ? OR x.concepto LIKE ? OR x.concepto_detalle LIKE ?
        OR x.proyecto LIKE ? OR x.constructora LIKE ? OR x.ubicacion_entrega LIKE ? OR x.numerodoc_ref LIKE ?)`
    );
    params.push(like, like, like, like, like, like, like, like);
  }

  try {
    const rows = await query(
      `${SQL_ENTREGAS}
       WHERE ${where.join(' AND ')}
       ORDER BY x.fecha_prevista_devolucion IS NULL, x.fecha_prevista_devolucion, x.id_movimiento`,
      params
    );
    return res.status(200).json({ codigo: 1, mensaje: 'OK', data: rows });
  } catch (err) {
    console.error('vw_inv_entrega_devolucion error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al consultar las entregas.', error: err.message });
  }
};

/** Detalle de una entrega: encabezado, líneas (entregado / devuelto / pendiente) y devoluciones registradas. */
const detalleEntregaDevolucion = async (req, res) => {
  const id = enteroONull(req.params.idMovimiento);
  if (!id) return res.status(400).json({ codigo: 0, mensaje: 'id_movimiento inválido.' });

  try {
    const [entrega] = await query(`${SQL_ENTREGAS} WHERE x.id_movimiento = ?`, [id]);
    if (!entrega) {
      return res.status(404).json({
        codigo: 0,
        mensaje: 'La entrega no existe, está anulada o no requiere devolución.',
      });
    }
    const items = await query(
      `SELECT id_detalle, linea, id_material, codigo_material, descripcion, categoria, um, ancho, alto,
              ubicacion, estado_material, observaciones,
              cantidad_entregada, cantidad_devuelta, GREATEST(cantidad_pendiente, 0) AS cantidad_pendiente
         FROM vw_inv_entrega_devolucion
        WHERE id_movimiento = ?
        ORDER BY linea`,
      [id]
    );
    const devoluciones = await query(
      `SELECT m.id_movimiento, m.consecutivo, DATE_FORMAT(m.fecha_movimiento, '%Y-%m-%d') AS fecha_devolucion,
              m.concepto_devolucion, m.autoriza, m.transporte, m.estado, m.usuario_crea,
              (SELECT IFNULL(SUM(d.cantidad), 0) FROM inv_movimiento_detalle d
                WHERE d.id_movimiento = m.id_movimiento AND d.estado = 'ACTIVO') AS cantidad
         FROM inv_movimiento m
        WHERE m.id_movimiento_origen = ? AND m.tipo_movimiento = 'DEVOLUCION'
        ORDER BY m.fecha_movimiento, m.id_movimiento`,
      [id]
    );
    return res.status(200).json({ codigo: 1, mensaje: 'OK', data: { entrega, items, devoluciones } });
  } catch (err) {
    console.error('detalle entrega devolución error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al consultar la entrega.', error: err.message });
  }
};

const registrarDevolucion = async (req, res) => {
  const body = req.body || {};
  const idEntrega = enteroONull(body.id_movimiento_entrega);
  if (!idEntrega) return res.status(400).json({ codigo: 0, mensaje: 'Seleccione la entrega que se devuelve.' });

  const cab = {
    consecutivo: textoONull(body.consecutivo)?.toUpperCase() ?? null,
    fecha_devolucion: textoONull(body.fecha_devolucion),
    concepto_devolucion: textoONull(body.concepto_devolucion),
    autoriza: textoONull(body.autoriza),
    transporte: textoONull(body.transporte),
    observaciones: textoONull(body.observaciones),
  };
  if (cab.consecutivo && (cab.consecutivo.length > 20 || !/^[A-Z0-9-]+$/.test(cab.consecutivo))) {
    return res.status(400).json({ codigo: 0, mensaje: 'El consecutivo solo admite letras, números y guion (máx. 20).' });
  }
  if (!cab.fecha_devolucion || !esFecha(cab.fecha_devolucion)) {
    return res.status(400).json({ codigo: 0, mensaje: 'La fecha de devolución es obligatoria.' });
  }
  if (!cab.concepto_devolucion) return res.status(400).json({ codigo: 0, mensaje: 'Seleccione el concepto de devolución.' });
  const max = { concepto_devolucion: 60, autoriza: 150, transporte: 150, observaciones: 500 };
  for (const [campo, limite] of Object.entries(max)) {
    if (cab[campo] && cab[campo].length > limite) {
      return res.status(400).json({ codigo: 0, mensaje: `${campo} supera ${limite} caracteres.` });
    }
  }

  const itemsRaw = Array.isArray(body.items) ? body.items : [];
  if (!itemsRaw.length) return res.status(400).json({ codigo: 0, mensaje: 'La devolución no tiene elementos.' });
  if (itemsRaw.length > MAX_ITEMS) {
    return res.status(400).json({ codigo: 0, mensaje: `Máximo ${MAX_ITEMS} elementos por devolución.` });
  }
  const items = [];
  for (let i = 0; i < itemsRaw.length; i++) {
    const raw = itemsRaw[i] || {};
    const linea = i + 1;
    const idDetalle = enteroONull(raw.id_detalle_origen);
    const cantidad = Number(raw.cantidad);
    if (!idDetalle) return res.status(400).json({ codigo: 0, mensaje: `Línea ${linea}: elemento de la entrega inválido.` });
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return res.status(400).json({ codigo: 0, mensaje: `Línea ${linea}: la cantidad debe ser mayor a 0.` });
    }
    const estado = textoONull(raw.estado_material);
    const obs = textoONull(raw.observaciones);
    if (estado && estado.length > 100) return res.status(400).json({ codigo: 0, mensaje: `Línea ${linea}: estado supera 100 caracteres.` });
    if (obs && obs.length > 500) return res.status(400).json({ codigo: 0, mensaje: `Línea ${linea}: observaciones supera 500 caracteres.` });
    items.push({ id_detalle_origen: idDetalle, cantidad, estado_material: estado, observaciones: obs });
  }

  try {
    const r = primerResultado(
      await query('CALL SP_INV_REGISTRAR_DEVOLUCION(?, ?, ?, ?)', [
        idEntrega,
        req.user?.id_usuario ?? null,
        JSON.stringify(cab),
        JSON.stringify(items),
      ])
    );
    const codigo = Number(r?.codigo);
    if (codigo === 1) {
      return res.status(201).json({
        codigo,
        mensaje: r.mensaje,
        data: { id_movimiento: r.id_movimiento, consecutivo: r.consecutivo },
      });
    }
    if (codigo === 2) {
      return res.status(409).json({ codigo, mensaje: r.mensaje, data: { consecutivo_sugerido: r.consecutivo_sugerido } });
    }
    return res.status(codigo === 0 ? 400 : 500).json({
      codigo: Number.isNaN(codigo) ? -1 : codigo,
      mensaje: r?.mensaje || 'No se pudo registrar la devolución.',
    });
  } catch (err) {
    console.error('SP_INV_REGISTRAR_DEVOLUCION error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al registrar la devolución.', error: err.message });
  }
};

module.exports = {
  listarEntregasPorDevolver,
  detalleEntregaDevolucion,
  registrarDevolucion,
};
