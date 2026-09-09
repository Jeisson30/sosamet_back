const db = require('../../config/db');

const callSp = (params) =>
  new Promise((resolve, reject) => {
    db.query(
      'CALL SP_ADMIN_INSUMOS(?, ?, ?, ?, ?, ?, ?)',
      params,
      (err, results) => {
        if (err) {
          console.error('SP_ADMIN_INSUMOS error:', err.message, { params });
          return reject(err);
        }
        resolve(results);
      }
    );
  });

const pickRowValue = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
};

const getSpMeta = (results) => {
  if (!Array.isArray(results)) return {};
  for (const set of results) {
    if (!Array.isArray(set) || !set.length) continue;
    const row = set[0];
    const codigo = pickRowValue(row, ['codigo', 'CODIGO']);
    const mensaje = pickRowValue(row, ['mensaje', 'MENSAJE']);
    if (
      row &&
      codigo !== undefined &&
      mensaje !== undefined &&
      row.id_categoria === undefined &&
      row.id_insumo === undefined &&
      row.siguiente_codigo === undefined
    ) {
      return { codigo, mensaje };
    }
  }
  return {};
};

const getSpData = (results, kind) => {
  if (!Array.isArray(results)) return [];
  for (const set of results) {
    if (!Array.isArray(set) || !set.length) continue;
    const row = set[0];
    if (!row) continue;
    if (kind === 'categoria' && row.id_categoria !== undefined) return set;
    if (kind === 'insumo' && row.id_insumo !== undefined) return set;
    if (kind === 'siguiente' && row.siguiente_codigo !== undefined) return set;
  }
  return [];
};

const respondFromSp = (res, results, options = {}) => {
  const { withData = false, kind = 'categoria' } = options;
  const meta = getSpMeta(results);
  const codigo = Number(meta.codigo);
  const mensaje = meta.mensaje || 'Operación procesada';

  if (Number.isNaN(codigo)) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'No se pudo interpretar la respuesta del procedimiento almacenado.',
    });
  }
  if (codigo === -1) return res.status(500).json({ codigo, mensaje });
  if (codigo !== 1) return res.status(400).json({ codigo, mensaje });

  if (withData) {
    return res.status(200).json({
      codigo,
      mensaje,
      data: getSpData(results, kind),
    });
  }
  return res.status(200).json({ codigo, mensaje });
};

const listarCategorias = async (req, res) => {
  const estado = String(req.query.estado || 'ACTIVO').toUpperCase();
  if (!['ACTIVO', 'INACTIVO'].includes(estado)) {
    return res.status(400).json({ codigo: 0, mensaje: 'Estado inválido.' });
  }
  try {
    const results = await callSp([1, null, null, null, null, null, estado]);
    return respondFromSp(res, results, { withData: true, kind: 'categoria' });
  } catch (err) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error al listar categorías.',
      error: err.message,
    });
  }
};

const crearCategoria = async (req, res) => {
  const { nombre, prefijo } = req.body || {};
  if (!nombre?.trim() || !prefijo?.trim()) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Nombre y prefijo son obligatorios.',
    });
  }
  try {
    const results = await callSp([
      2,
      null,
      null,
      nombre.trim(),
      prefijo.trim().toUpperCase(),
      null,
      null,
    ]);
    return respondFromSp(res, results);
  } catch (err) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error al crear categoría.',
      error: err.message,
    });
  }
};

const actualizarCategoria = async (req, res) => {
  const id = Number(req.params.idCategoria);
  const { nombre } = req.body || {};
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'id_categoria inválido.' });
  }
  if (!nombre?.trim()) {
    return res.status(400).json({ codigo: 0, mensaje: 'El nombre es obligatorio.' });
  }
  try {
    const results = await callSp([3, id, null, nombre.trim(), null, null, null]);
    return respondFromSp(res, results);
  } catch (err) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error al actualizar categoría.',
      error: err.message,
    });
  }
};

const cambiarEstadoCategoria = async (req, res) => {
  const id = Number(req.params.idCategoria);
  const estado = String(req.body?.estado || '').toUpperCase();
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'id_categoria inválido.' });
  }
  if (!['ACTIVO', 'INACTIVO'].includes(estado)) {
    return res.status(400).json({ codigo: 0, mensaje: 'Estado inválido.' });
  }
  try {
    const results = await callSp([4, id, null, null, null, null, estado]);
    return respondFromSp(res, results);
  } catch (err) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error al cambiar estado de categoría.',
      error: err.message,
    });
  }
};

const listarInsumos = async (req, res) => {
  const estado = String(req.query.estado || 'ACTIVO').toUpperCase();
  const categoriaId = req.query.id_categoria
    ? Number(req.query.id_categoria)
    : null;
  if (!['ACTIVO', 'INACTIVO'].includes(estado)) {
    return res.status(400).json({ codigo: 0, mensaje: 'Estado inválido.' });
  }
  try {
    const results = await callSp([
      5,
      null,
      Number.isFinite(categoriaId) && categoriaId > 0 ? categoriaId : null,
      null,
      null,
      null,
      estado,
    ]);
    return respondFromSp(res, results, { withData: true, kind: 'insumo' });
  } catch (err) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error al listar insumos.',
      error: err.message,
    });
  }
};

const crearInsumo = async (req, res) => {
  const { id_categoria, nombre, codigo } = req.body || {};
  const categoriaId = Number(id_categoria);
  if (!Number.isFinite(categoriaId) || categoriaId <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'La categoría es obligatoria.' });
  }
  if (!nombre?.trim()) {
    return res.status(400).json({ codigo: 0, mensaje: 'El nombre es obligatorio.' });
  }
  try {
    const results = await callSp([
      6,
      null,
      categoriaId,
      nombre.trim(),
      null,
      codigo ? String(codigo).trim().toUpperCase() : null,
      null,
    ]);
    return respondFromSp(res, results);
  } catch (err) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error al crear insumo.',
      error: err.message,
    });
  }
};

const actualizarInsumo = async (req, res) => {
  const id = Number(req.params.idInsumo);
  const { nombre, codigo } = req.body || {};
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'id_insumo inválido.' });
  }
  if (!nombre?.trim() || !codigo?.trim()) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Nombre y código son obligatorios.',
    });
  }
  try {
    const results = await callSp([
      7,
      id,
      null,
      nombre.trim(),
      null,
      codigo.trim().toUpperCase(),
      null,
    ]);
    return respondFromSp(res, results);
  } catch (err) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error al actualizar insumo.',
      error: err.message,
    });
  }
};

const cambiarEstadoInsumo = async (req, res) => {
  const id = Number(req.params.idInsumo);
  const estado = String(req.body?.estado || '').toUpperCase();
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'id_insumo inválido.' });
  }
  if (!['ACTIVO', 'INACTIVO'].includes(estado)) {
    return res.status(400).json({ codigo: 0, mensaje: 'Estado inválido.' });
  }
  try {
    const results = await callSp([8, id, null, null, null, null, estado]);
    return respondFromSp(res, results);
  } catch (err) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error al cambiar estado de insumo.',
      error: err.message,
    });
  }
};

const siguienteCodigo = async (req, res) => {
  const categoriaId = Number(req.query.id_categoria || req.params.idCategoria);
  if (!Number.isFinite(categoriaId) || categoriaId <= 0) {
    return res.status(400).json({ codigo: 0, mensaje: 'id_categoria es obligatorio.' });
  }
  try {
    const results = await callSp([9, null, categoriaId, null, null, null, null]);
    const meta = getSpMeta(results);
    const codigo = Number(meta.codigo);
    if (codigo !== 1) {
      return res.status(400).json({
        codigo: codigo || 0,
        mensaje: meta.mensaje || 'No se pudo calcular el código.',
      });
    }
    const data = getSpData(results, 'siguiente');
    return res.status(200).json({
      codigo: 1,
      mensaje: 'OK',
      data: data[0] || null,
    });
  } catch (err) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error al calcular siguiente código.',
      error: err.message,
    });
  }
};

module.exports = {
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  cambiarEstadoCategoria,
  listarInsumos,
  crearInsumo,
  actualizarInsumo,
  cambiarEstadoInsumo,
  siguienteCodigo,
};
