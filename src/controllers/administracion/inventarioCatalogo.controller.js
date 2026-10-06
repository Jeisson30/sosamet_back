const db = require('../../config/db');

const ESTADOS = ['ACTIVO', 'INACTIVO'];
const PATRON_CODIGO = /^[0-9]{6,10}$/;

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => (err ? reject(err) : resolve(results)));
  });

const idValido = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const texto = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, max);

const estadoDe = (v, porDefecto = 'ACTIVO') => {
  const e = String(v ?? porDefecto).trim().toUpperCase();
  return ESTADOS.includes(e) ? e : null;
};

const errorServidor = (res, mensaje, err) => {
  console.error(`${mensaje}:`, err.message);
  return res.status(500).json({ codigo: -1, mensaje, error: err.message });
};

/* ---------- Categorías ---------- */

const listarCategorias = async (req, res) => {
  const estado = estadoDe(req.query.estado);
  if (!estado) return res.status(400).json({ codigo: 0, mensaje: 'Estado inválido.' });
  try {
    const rows = await query(
      `SELECT c.id_categoria, c.nombre, c.orden, c.estado, c.fecha_creacion, c.fecha_modificacion,
              (SELECT COUNT(*) FROM inv_material m
                WHERE m.id_categoria = c.id_categoria AND m.estado = 'ACTIVO') AS total_codigos
         FROM inv_categoria c
        WHERE c.estado = ?
        ORDER BY c.orden, c.nombre`,
      [estado]
    );
    return res.status(200).json({ codigo: 1, mensaje: 'OK', data: rows });
  } catch (err) {
    return errorServidor(res, 'Error al listar categorías de inventario', err);
  }
};

const crearCategoria = async (req, res) => {
  const nombre = texto(req.body?.nombre, 150);
  if (!nombre) return res.status(400).json({ codigo: 0, mensaje: 'El nombre es obligatorio.' });
  try {
    const [existe] = await query('SELECT estado FROM inv_categoria WHERE nombre = ?', [nombre]);
    if (existe) {
      return res.status(400).json({
        codigo: 0,
        mensaje: `La categoría "${nombre}" ya existe${existe.estado === 'INACTIVO' ? ' (inactiva; puede reactivarla)' : ''}.`,
      });
    }
    await query(
      'INSERT INTO inv_categoria (nombre, orden) SELECT ?, IFNULL(MAX(orden), 0) + 1 FROM inv_categoria',
      [nombre]
    );
    return res.status(200).json({ codigo: 1, mensaje: `Categoría "${nombre}" creada.` });
  } catch (err) {
    return errorServidor(res, 'Error al crear la categoría', err);
  }
};

const actualizarCategoria = async (req, res) => {
  const id = idValido(req.params.idCategoria);
  const nombre = texto(req.body?.nombre, 150);
  if (!id) return res.status(400).json({ codigo: 0, mensaje: 'id_categoria inválido.' });
  if (!nombre) return res.status(400).json({ codigo: 0, mensaje: 'El nombre es obligatorio.' });
  try {
    const [dup] = await query(
      'SELECT 1 FROM inv_categoria WHERE nombre = ? AND id_categoria <> ?',
      [nombre, id]
    );
    if (dup) return res.status(400).json({ codigo: 0, mensaje: `Ya existe la categoría "${nombre}".` });
    const r = await query(
      'UPDATE inv_categoria SET nombre = ?, fecha_modificacion = NOW() WHERE id_categoria = ?',
      [nombre, id]
    );
    if (!r.affectedRows) return res.status(400).json({ codigo: 0, mensaje: 'La categoría no existe.' });
    return res.status(200).json({ codigo: 1, mensaje: 'Categoría actualizada.' });
  } catch (err) {
    return errorServidor(res, 'Error al actualizar la categoría', err);
  }
};

const cambiarEstadoCategoria = async (req, res) => {
  const id = idValido(req.params.idCategoria);
  const estado = estadoDe(req.body?.estado, '');
  if (!id) return res.status(400).json({ codigo: 0, mensaje: 'id_categoria inválido.' });
  if (!estado) return res.status(400).json({ codigo: 0, mensaje: 'Estado inválido.' });
  try {
    const r = await query(
      'UPDATE inv_categoria SET estado = ?, fecha_modificacion = NOW() WHERE id_categoria = ?',
      [estado, id]
    );
    if (!r.affectedRows) return res.status(400).json({ codigo: 0, mensaje: 'La categoría no existe.' });
    return res.status(200).json({
      codigo: 1,
      mensaje: estado === 'ACTIVO' ? 'Categoría reactivada.' : 'Categoría inactivada.',
    });
  } catch (err) {
    return errorServidor(res, 'Error al cambiar el estado de la categoría', err);
  }
};

/* ---------- Códigos (materiales) ---------- */

/**
 * ACTIVO: códigos activos de categorías activas (lo que se puede seleccionar al ingresar).
 * INACTIVO: códigos inactivos.
 */
const listarMateriales = async (req, res) => {
  const estado = estadoDe(req.query.estado);
  if (!estado) return res.status(400).json({ codigo: 0, mensaje: 'Estado inválido.' });
  const where = ['m.estado = ?'];
  const params = [estado];
  if (estado === 'ACTIVO') where.push("c.estado = 'ACTIVO'");
  const idCategoria = idValido(req.query.id_categoria);
  if (idCategoria) {
    where.push('m.id_categoria = ?');
    params.push(idCategoria);
  }
  const buscar = String(req.query.buscar ?? '').trim().slice(0, 100);
  if (buscar) {
    where.push('(m.codigo LIKE ? OR m.descripcion LIKE ?)');
    params.push(`%${buscar}%`, `%${buscar}%`);
  }
  try {
    const rows = await query(
      `SELECT m.id_material, m.codigo, m.descripcion, m.id_categoria, c.nombre AS categoria,
              m.estado, m.fecha_creacion, m.fecha_modificacion
         FROM inv_material m
        INNER JOIN inv_categoria c ON c.id_categoria = m.id_categoria
        WHERE ${where.join(' AND ')}
        ORDER BY c.orden, m.codigo`,
      params
    );
    return res.status(200).json({ codigo: 1, mensaje: 'OK', data: rows });
  } catch (err) {
    return errorServidor(res, 'Error al listar códigos de inventario', err);
  }
};

const categoriaActiva = async (idCategoria) => {
  const [c] = await query('SELECT estado FROM inv_categoria WHERE id_categoria = ?', [idCategoria]);
  return c?.estado === 'ACTIVO';
};

const crearMaterial = async (req, res) => {
  const idCategoria = idValido(req.body?.id_categoria);
  const codigo = String(req.body?.codigo ?? '').trim();
  const descripcion = texto(req.body?.descripcion, 255);
  if (!idCategoria) return res.status(400).json({ codigo: 0, mensaje: 'La categoría es obligatoria.' });
  if (!PATRON_CODIGO.test(codigo)) {
    return res.status(400).json({ codigo: 0, mensaje: 'El número de cuenta debe tener solo dígitos (6 a 10).' });
  }
  if (!descripcion) return res.status(400).json({ codigo: 0, mensaje: 'La descripción es obligatoria.' });
  try {
    if (!(await categoriaActiva(idCategoria))) {
      return res.status(400).json({ codigo: 0, mensaje: 'La categoría no existe o está inactiva.' });
    }
    const [existe] = await query(
      `SELECT m.descripcion, m.estado, c.nombre AS categoria
         FROM inv_material m INNER JOIN inv_categoria c ON c.id_categoria = m.id_categoria
        WHERE m.codigo = ?`,
      [codigo]
    );
    if (existe) {
      return res.status(400).json({
        codigo: 0,
        mensaje: `El código ${codigo} ya existe: ${existe.descripcion} (${existe.categoria}${existe.estado === 'INACTIVO' ? ', inactivo' : ''}).`,
      });
    }
    await query(
      'INSERT INTO inv_material (id_categoria, codigo, descripcion) VALUES (?, ?, ?)',
      [idCategoria, codigo, descripcion]
    );
    return res.status(200).json({ codigo: 1, mensaje: `Código ${codigo} creado.` });
  } catch (err) {
    return errorServidor(res, 'Error al crear el código', err);
  }
};

/** El número de cuenta no se edita; solo descripción y categoría. */
const actualizarMaterial = async (req, res) => {
  const id = idValido(req.params.idMaterial);
  const idCategoria = idValido(req.body?.id_categoria);
  const descripcion = texto(req.body?.descripcion, 255);
  if (!id) return res.status(400).json({ codigo: 0, mensaje: 'id_material inválido.' });
  if (!idCategoria) return res.status(400).json({ codigo: 0, mensaje: 'La categoría es obligatoria.' });
  if (!descripcion) return res.status(400).json({ codigo: 0, mensaje: 'La descripción es obligatoria.' });
  try {
    if (!(await categoriaActiva(idCategoria))) {
      return res.status(400).json({ codigo: 0, mensaje: 'La categoría no existe o está inactiva.' });
    }
    const r = await query(
      `UPDATE inv_material
          SET descripcion = ?, id_categoria = ?, fecha_modificacion = NOW()
        WHERE id_material = ?`,
      [descripcion, idCategoria, id]
    );
    if (!r.affectedRows) return res.status(400).json({ codigo: 0, mensaje: 'El código no existe.' });
    return res.status(200).json({ codigo: 1, mensaje: 'Código actualizado.' });
  } catch (err) {
    return errorServidor(res, 'Error al actualizar el código', err);
  }
};

const cambiarEstadoMaterial = async (req, res) => {
  const id = idValido(req.params.idMaterial);
  const estado = estadoDe(req.body?.estado, '');
  if (!id) return res.status(400).json({ codigo: 0, mensaje: 'id_material inválido.' });
  if (!estado) return res.status(400).json({ codigo: 0, mensaje: 'Estado inválido.' });
  try {
    const r = await query(
      'UPDATE inv_material SET estado = ?, fecha_modificacion = NOW() WHERE id_material = ?',
      [estado, id]
    );
    if (!r.affectedRows) return res.status(400).json({ codigo: 0, mensaje: 'El código no existe.' });
    return res.status(200).json({
      codigo: 1,
      mensaje: estado === 'ACTIVO' ? 'Código reactivado.' : 'Código inactivado.',
    });
  } catch (err) {
    return errorServidor(res, 'Error al cambiar el estado del código', err);
  }
};

module.exports = {
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  cambiarEstadoCategoria,
  listarMateriales,
  crearMaterial,
  actualizarMaterial,
  cambiarEstadoMaterial,
};
