const fs = require('fs');
const db = require('../../config/db');

const TIPOS_MOVIMIENTO = ['INGRESO', 'DESPACHO', 'AJUSTE', 'TRASLADO', 'DEVOLUCION'];
const ORIGENES = ['MANUAL', 'PLANO', 'MIXTO'];
const TIPOS_ENTREGA = ['REQUIERE_DEVOLUCION', 'NO_REQUIERE_DEVOLUCION'];
const GRUPOS_PARAMETRO = ['UM', 'UBICACION', 'PRIORIDAD', 'ESTADO_MATERIAL', 'CONCEPTO_ENTREGA', 'AREA', 'CONCEPTO_DEVOLUCION'];
const MAX_ITEMS = 5000;

/** Campo del ítem → [tipo, longitud máxima] (mismas longitudes que inv_movimiento_detalle). */
const CAMPOS_ITEM = {
  codigo: ['texto', 20],
  cantidad: ['numero'],
  um: ['texto', 30],
  fecha_fc: ['fecha'],
  no_doc: ['texto', 100],
  descripcion: ['texto', 255],
  longitud: ['numero'],
  ancho: ['numero'],
  alto: ['numero'],
  valor: ['numero'],
  iva: ['numero'],
  total: ['numero'],
  valor_um: ['numero'],
  ubicacion: ['texto', 100],
  proveedor: ['texto', 150],
  ciudad: ['texto', 100],
  prioridad: ['texto', 40],
  fecha_mantenimiento: ['fecha'],
  estado_material: ['texto', 100],
  observaciones: ['texto', 500],
  signo: ['numero'],
  tipo_doc_ref: ['texto', 50],
  numerodoc_ref: ['texto', 100],
};

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

/**
 * Normaliza un ítem para el SP: omite vacíos (el SP los toma como NULL) y
 * devuelve el primer error de formato encontrado.
 */
const normalizarItem = (raw, linea) => {
  const item = {};
  for (const [campo, [tipo, max]] of Object.entries(CAMPOS_ITEM)) {
    const valor = raw?.[campo];
    if (valor === undefined || valor === null || String(valor).trim() === '') continue;

    if (tipo === 'numero') {
      const n = Number(valor);
      if (!Number.isFinite(n)) return { error: `Línea ${linea}: ${campo} no es numérico.` };
      item[campo] = n;
    } else if (tipo === 'fecha') {
      const s = String(valor).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: `Línea ${linea}: ${campo} debe ser AAAA-MM-DD.` };
      item[campo] = s;
    } else {
      const s = String(valor).trim();
      if (s.length > max) return { error: `Línea ${linea}: ${campo} supera ${max} caracteres.` };
      item[campo] = s;
    }
  }
  if (!item.codigo) return { error: `Línea ${linea}: el código es obligatorio.` };
  if (!(item.cantidad > 0)) return { error: `Línea ${linea}: la cantidad debe ser mayor a 0.` };
  if (!item.um) return { error: `Línea ${linea}: la U.M. es obligatoria.` };
  return { item };
};

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const esOtro = (s) => String(s || '').trim().toUpperCase() === 'OTRO';

/** Ubicación del ingreso → empresa del formato: PLANTA HIERROS = 2; el resto = 1 (Sosamet). */
const empresaDeUbicacion = (ubicacion) => (String(ubicacion || '').toUpperCase().includes('HIERRO') ? 2 : 1);

/**
 * Cabecera de la entrega (DESPACHO): campos obligatorios del formulario + "Otro" con detalle.
 * La empresa (logo) sale de la ubicación de los ítems; una entrega no mezcla plantas.
 */
const normalizarCabeceraEntrega = (body, items) => {
  const empresas = [...new Set(items.map((it) => empresaDeUbicacion(it.ubicacion)))];
  if (empresas.length > 1) {
    return { error: 'La entrega no puede mezclar material de Planta Sosamet y Planta Hierros.' };
  }
  const cab = {
    consecutivo: textoONull(body.consecutivo)?.toUpperCase() ?? null,
    fecha_movimiento: textoONull(body.fecha_movimiento),
    id_empresa: empresas[0],
    concepto: textoONull(body.concepto),
    concepto_detalle: textoONull(body.concepto_detalle),
    area: textoONull(body.area),
    area_detalle: textoONull(body.area_detalle),
    id_usuario_entregado: enteroONull(body.id_usuario_entregado),
    ubicacion_entrega: textoONull(body.ubicacion_entrega),
    tipo_entrega: textoONull(body.tipo_entrega)?.toUpperCase() ?? null,
    fecha_prevista_devolucion: textoONull(body.fecha_prevista_devolucion),
    autoriza: textoONull(body.autoriza),
    transporte: textoONull(body.transporte),
  };

  if (cab.consecutivo && (cab.consecutivo.length > 20 || !/^[A-Z0-9-]+$/.test(cab.consecutivo))) {
    return { error: 'El consecutivo solo admite letras, números y guion (máx. 20).' };
  }
  if (!cab.fecha_movimiento || !esFecha(cab.fecha_movimiento)) return { error: 'La fecha de entrega es obligatoria.' };
  if (!cab.concepto) return { error: 'Seleccione el concepto.' };
  if (esOtro(cab.concepto) && !cab.concepto_detalle) return { error: 'Indique cuál es el concepto (Otro).' };
  if (!cab.area) return { error: 'Seleccione el área.' };
  if (esOtro(cab.area) && !cab.area_detalle) return { error: 'Indique cuál es el área (Otro).' };
  if (!cab.id_usuario_entregado) return { error: 'Seleccione a quién se entrega.' };
  if (!TIPOS_ENTREGA.includes(cab.tipo_entrega)) return { error: 'Seleccione el tipo de entrega.' };
  if (cab.tipo_entrega === 'REQUIERE_DEVOLUCION') {
    if (!cab.fecha_prevista_devolucion || !esFecha(cab.fecha_prevista_devolucion)) {
      return { error: 'Indique la fecha prevista de devolución.' };
    }
  } else {
    cab.fecha_prevista_devolucion = null;
  }
  if (!esOtro(cab.concepto)) cab.concepto_detalle = null;
  if (!esOtro(cab.area)) cab.area_detalle = null;

  const max = { concepto: 60, concepto_detalle: 150, area: 60, area_detalle: 150, ubicacion_entrega: 255, autoriza: 150, transporte: 150 };
  for (const [campo, limite] of Object.entries(max)) {
    if (cab[campo] && cab[campo].length > limite) return { error: `${campo} supera ${limite} caracteres.` };
  }
  return { cab };
};

const registrarMovimiento = async (req, res) => {
  const body = req.body || {};
  const tipo = String(body.tipo_movimiento || '').trim().toUpperCase();
  const origen = String(body.origen || 'MANUAL').trim().toUpperCase();
  const itemsRaw = Array.isArray(body.items) ? body.items : [];

  if (!TIPOS_MOVIMIENTO.includes(tipo)) {
    return res.status(400).json({ codigo: 0, mensaje: 'Tipo de movimiento inválido.' });
  }
  if (tipo === 'DEVOLUCION') {
    return res.status(400).json({ codigo: 0, mensaje: 'Las devoluciones se registran desde Devolución de material.' });
  }
  if (!ORIGENES.includes(origen)) {
    return res.status(400).json({ codigo: 0, mensaje: 'Origen inválido.' });
  }
  if (!itemsRaw.length) {
    return res.status(400).json({ codigo: 0, mensaje: 'El movimiento no tiene materiales.' });
  }
  if (itemsRaw.length > MAX_ITEMS) {
    return res.status(400).json({ codigo: 0, mensaje: `Máximo ${MAX_ITEMS} materiales por movimiento.` });
  }

  const items = [];
  for (let i = 0; i < itemsRaw.length; i++) {
    const { item, error } = normalizarItem(itemsRaw[i], i + 1);
    if (error) return res.status(400).json({ codigo: 0, mensaje: error });
    items.push(item);
  }

  let cabecera = null;
  if (tipo === 'DESPACHO') {
    const { cab, error } = normalizarCabeceraEntrega(body, items);
    if (error) return res.status(400).json({ codigo: 0, mensaje: error });
    cabecera = cab;
  }

  try {
    const results = await query('CALL SP_INV_REGISTRAR_MOVIMIENTO(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      tipo,
      origen,
      textoONull(body.archivo_plano)?.slice(0, 255) ?? null,
      textoONull(body.tipo_doc_ref),
      textoONull(body.numerodoc_ref),
      enteroONull(body.id_constructora),
      enteroONull(body.id_proyecto),
      textoONull(body.observaciones)?.slice(0, 500) ?? null,
      req.user?.id_usuario ?? null,
      JSON.stringify(items),
      cabecera ? JSON.stringify(cabecera) : null,
    ]);
    const r = primerResultado(results);
    const codigo = Number(r?.codigo);
    if (codigo === 1) {
      return res.status(201).json({
        codigo,
        mensaje: r.mensaje,
        data: { id_movimiento: r.id_movimiento, consecutivo: r.consecutivo },
      });
    }
    if (codigo === 2) {
      return res.status(409).json({
        codigo,
        mensaje: r.mensaje,
        data: { consecutivo_sugerido: r.consecutivo_sugerido },
      });
    }
    return res.status(codigo === 0 ? 400 : 500).json({
      codigo: Number.isNaN(codigo) ? -1 : codigo,
      mensaje: r?.mensaje || 'No se pudo registrar el movimiento.',
    });
  } catch (err) {
    console.error('SP_INV_REGISTRAR_MOVIMIENTO error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al registrar el movimiento.', error: err.message });
  }
};

/** Consulta por ítem (SP_INV_CONSULTAR_MOVIMIENTOS); todos los filtros son opcionales. */
const listarMovimientos = async (req, res) => {
  const q = req.query || {};

  const tipo = textoONull(q.tipo_movimiento)?.toUpperCase() ?? null;
  if (tipo && !TIPOS_MOVIMIENTO.includes(tipo)) {
    return res.status(400).json({ codigo: 0, mensaje: 'Tipo de movimiento inválido.' });
  }
  const fechas = {};
  for (const param of ['fecha_desde', 'fecha_hasta']) {
    const f = textoONull(q[param]);
    if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) {
      return res.status(400).json({ codigo: 0, mensaje: `${param} debe ser AAAA-MM-DD.` });
    }
    fechas[param] = f;
  }

  try {
    const results = await query('CALL SP_INV_CONSULTAR_MOVIMIENTOS(?, ?, ?, ?, ?, ?, ?)', [
      tipo,
      textoONull(q.buscar)?.slice(0, 150) ?? null,
      enteroONull(q.id_categoria),
      textoONull(q.prioridad),
      textoONull(q.ubicacion),
      fechas.fecha_desde,
      fechas.fecha_hasta,
    ]);
    const rows = Array.isArray(results) ? results.find((r) => Array.isArray(r)) || [] : [];
    return res.status(200).json({ codigo: 1, mensaje: 'OK', data: rows });
  } catch (err) {
    console.error('SP_INV_CONSULTAR_MOVIMIENTOS error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al consultar movimientos.', error: err.message });
  }
};

const responderSp = (res, r, mensajeError) => {
  const codigo = Number(r?.codigo);
  if (codigo === 1) return res.status(200).json({ codigo, mensaje: r.mensaje });
  return res.status(codigo === 0 ? 400 : 500).json({
    codigo: Number.isNaN(codigo) ? -1 : codigo,
    mensaje: r?.mensaje || mensajeError,
  });
};

const editarItem = async (req, res) => {
  const id = Number(req.params.idDetalle);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'id_detalle inválido.' });
  }
  const { item, error } = normalizarItem(req.body?.item, 1);
  if (error) return res.status(400).json({ codigo: 0, mensaje: error.replace('Línea 1: ', '') });

  try {
    const r = primerResultado(
      await query('CALL SP_INV_EDITAR_ITEM(?, ?, ?)', [id, req.user?.id_usuario ?? null, JSON.stringify(item)])
    );
    return responderSp(res, r, 'No se pudo editar el ítem.');
  } catch (err) {
    console.error('SP_INV_EDITAR_ITEM error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al editar el ítem.', error: err.message });
  }
};

const cambiarEstadoItem = (accion) => async (req, res) => {
  const id = Number(req.params.idDetalle);
  const motivo = textoONull(req.body?.motivo);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'id_detalle inválido.' });
  }
  if (!motivo) {
    return res.status(400).json({ codigo: 0, mensaje: 'El motivo es obligatorio.' });
  }
  try {
    const r = primerResultado(
      await query('CALL SP_INV_CAMBIAR_ESTADO_ITEM(?, ?, ?, ?)', [
        id,
        accion,
        req.user?.id_usuario ?? null,
        motivo.slice(0, 500),
      ])
    );
    return responderSp(res, r, 'No se pudo actualizar el ítem.');
  } catch (err) {
    console.error('SP_INV_CAMBIAR_ESTADO_ITEM error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al actualizar el ítem.', error: err.message });
  }
};

const historialItem = async (req, res) => {
  const id = Number(req.params.idDetalle);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'id_detalle inválido.' });
  }
  try {
    const rows = await query(
      `SELECT id_historial, accion, motivo, datos_anteriores, datos_nuevos, usuario, fecha
         FROM inv_movimiento_detalle_historial
        WHERE id_detalle = ?
        ORDER BY fecha DESC, id_historial DESC`,
      [id]
    );
    return res.status(200).json({ codigo: 1, mensaje: 'OK', data: rows });
  } catch (err) {
    console.error('inv_movimiento_detalle_historial error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al consultar el historial.', error: err.message });
  }
};

const anularMovimiento = async (req, res) => {
  const id = Number(req.params.idMovimiento);
  const motivo = textoONull(req.body?.motivo);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'id_movimiento inválido.' });
  }
  if (!motivo) {
    return res.status(400).json({ codigo: 0, mensaje: 'El motivo de anulación es obligatorio.' });
  }
  try {
    const r = primerResultado(
      await query('CALL SP_INV_ANULAR_MOVIMIENTO(?, ?, ?)', [id, req.user?.id_usuario ?? null, motivo.slice(0, 500)])
    );
    const codigo = Number(r?.codigo);
    if (codigo === 1) return res.status(200).json({ codigo, mensaje: r.mensaje });
    return res.status(codigo === 0 ? 400 : 500).json({
      codigo: Number.isNaN(codigo) ? -1 : codigo,
      mensaje: r?.mensaje || 'No se pudo anular el movimiento.',
    });
  } catch (err) {
    console.error('SP_INV_ANULAR_MOVIMIENTO error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al anular el movimiento.', error: err.message });
  }
};

const listarExistencias = async (req, res) => {
  const where = [];
  const params = [];
  const codigo = textoONull(req.query?.codigo);
  if (codigo) {
    where.push('codigo = ?');
    params.push(codigo.toUpperCase());
  }
  const ubicacion = textoONull(req.query?.ubicacion);
  if (ubicacion) {
    where.push('ubicacion = ?');
    params.push(ubicacion.toUpperCase());
  }
  const idCategoria = enteroONull(req.query?.id_categoria);
  if (idCategoria) {
    where.push('id_categoria = ?');
    params.push(idCategoria);
  }
  const buscar = textoONull(req.query?.buscar)?.slice(0, 150);
  if (buscar) {
    where.push('(codigo LIKE ? OR descripcion LIKE ?)');
    params.push(`%${buscar}%`, `%${buscar}%`);
  }
  if (String(req.query?.solo_disponibles || '') === '1') {
    where.push('saldo > 0');
  }
  try {
    const rows = await query(
      `SELECT * FROM vw_inv_existencias
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY categoria, codigo, ubicacion`,
      params
    );
    return res.status(200).json({ codigo: 1, mensaje: 'OK', data: rows });
  } catch (err) {
    console.error('vw_inv_existencias error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al consultar existencias.', error: err.message });
  }
};

/** Peek del siguiente consecutivo (no lo reserva); el usuario puede editarlo antes de guardar. */
const siguienteConsecutivo = async (req, res) => {
  const tipo = textoONull(req.query?.tipo)?.toUpperCase() ?? null;
  if (!tipo || !TIPOS_MOVIMIENTO.includes(tipo)) {
    return res.status(400).json({ codigo: 0, mensaje: 'Tipo de movimiento inválido.' });
  }
  try {
    const r = primerResultado(await query('CALL SP_INV_SIGUIENTE_CONSECUTIVO(?)', [tipo]));
    if (Number(r?.codigo) !== 1) {
      return res.status(400).json({ codigo: 0, mensaje: r?.mensaje || 'No se pudo calcular el consecutivo.' });
    }
    return res.status(200).json({
      codigo: 1,
      mensaje: r.mensaje,
      data: { consecutivo: r.consecutivo, numero: r.numero, prefijo: r.prefijo },
    });
  } catch (err) {
    console.error('SP_INV_SIGUIENTE_CONSECUTIVO error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al calcular el consecutivo.', error: err.message });
  }
};

/** Catálogo inv_parametro: ?grupo=CONCEPTO_ENTREGA,AREA (solo ACTIVOS, en orden). */
const listarParametros = async (req, res) => {
  const grupos = String(req.query?.grupo || '')
    .split(',')
    .map((g) => g.trim().toUpperCase())
    .filter((g) => GRUPOS_PARAMETRO.includes(g));
  if (!grupos.length) {
    return res.status(400).json({ codigo: 0, mensaje: `Grupo inválido. Use: ${GRUPOS_PARAMETRO.join(', ')}.` });
  }
  try {
    const rows = await query(
      `SELECT id_parametro, grupo, valor, orden
         FROM inv_parametro
        WHERE estado = 'ACTIVO' AND grupo IN (?)
        ORDER BY grupo, orden, valor`,
      [grupos]
    );
    return res.status(200).json({ codigo: 1, mensaje: 'OK', data: rows });
  } catch (err) {
    console.error('inv_parametro error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al consultar parámetros.', error: err.message });
  }
};

const borrarArchivos = (files) => {
  for (const f of files || []) {
    fs.unlink(f.path, () => {});
  }
};

/** Foto Elemento: varias imágenes por movimiento (multipart, campo "fotos"). */
const subirAdjuntos = async (req, res) => {
  const id = Number(req.params.idMovimiento);
  const files = Array.isArray(req.files) ? req.files : [];
  if (!Number.isInteger(id) || id <= 0) {
    borrarArchivos(files);
    return res.status(400).json({ codigo: 0, mensaje: 'id_movimiento inválido.' });
  }
  if (!files.length) {
    return res.status(400).json({ codigo: 0, mensaje: 'No se recibieron fotos.' });
  }
  try {
    const [mov] = await query('SELECT id_movimiento FROM inv_movimiento WHERE id_movimiento = ?', [id]);
    if (!mov) {
      borrarArchivos(files);
      return res.status(404).json({ codigo: 0, mensaje: 'El movimiento no existe.' });
    }
    const valores = files.map((f) => [
      id,
      String(f.originalname || f.filename).slice(0, 255),
      `/uploads/inventario/${f.filename}`,
      f.mimetype || null,
      f.size || null,
      req.user?.id_usuario ?? null,
    ]);
    await query(
      'INSERT INTO inv_movimiento_adjunto (id_movimiento, nombre_original, ruta, tipo_mime, tamano, id_usuario) VALUES ?',
      [valores]
    );
    return res.status(201).json({ codigo: 1, mensaje: `${files.length} foto(s) guardada(s).` });
  } catch (err) {
    borrarArchivos(files);
    console.error('inv_movimiento_adjunto error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al guardar las fotos.', error: err.message });
  }
};

const listarAdjuntos = async (req, res) => {
  const id = Number(req.params.idMovimiento);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'id_movimiento inválido.' });
  }
  try {
    const rows = await query(
      `SELECT id_adjunto, nombre_original, ruta, tipo_mime, tamano, fecha_creacion
         FROM inv_movimiento_adjunto
        WHERE id_movimiento = ? AND estado = 'ACTIVO'
        ORDER BY id_adjunto`,
      [id]
    );
    return res.status(200).json({ codigo: 1, mensaje: 'OK', data: rows });
  } catch (err) {
    console.error('inv_movimiento_adjunto error:', err.message);
    return res.status(500).json({ codigo: -1, mensaje: 'Error al consultar las fotos.', error: err.message });
  }
};

module.exports = {
  registrarMovimiento,
  siguienteConsecutivo,
  listarParametros,
  subirAdjuntos,
  listarAdjuntos,
  listarMovimientos,
  anularMovimiento,
  listarExistencias,
  editarItem,
  normalizarCabeceraEntrega,
  anularItem: cambiarEstadoItem('ANULAR'),
  eliminarItem: cambiarEstadoItem('ELIMINAR'),
  historialItem,
};
