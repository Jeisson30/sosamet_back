const db = require('../../config/db');

const callSp = (params) =>
  new Promise((resolve, reject) => {
    db.query(
      'CALL SP_ADMIN_CONSTRUCTORAS_PROYECTOS(?, ?, ?, ?, ?, ?)',
      params,
      (err, results) => {
        if (err) {
          console.error('SP_ADMIN_CONSTRUCTORAS_PROYECTOS error:', err.message, {
            params,
          });
          return reject(err);
        }
        resolve(results);
      }
    );
  });

const pickRowValue = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
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
      row.id_constructora === undefined &&
      row.id_proyecto === undefined
    ) {
      return { codigo, mensaje };
    }
  }

  return {};
};

const getSpData = (results) => {
  if (!Array.isArray(results)) return [];

  for (const set of results) {
    if (!Array.isArray(set) || !set.length) continue;

    const row = set[0];
    if (
      row &&
      (row.id_constructora !== undefined || row.id_proyecto !== undefined)
    ) {
      return set;
    }
  }

  return [];
};

const respondFromSp = (res, results, options = {}) => {
  const { withData = false } = options;
  const meta = getSpMeta(results);
  const codigo = Number(meta.codigo);
  const mensaje = meta.mensaje || 'Operación procesada';

  if (Number.isNaN(codigo)) {
    return res.status(500).json({
      codigo: -1,
      mensaje: 'No se pudo interpretar la respuesta del procedimiento almacenado.',
    });
  }

  if (codigo === -1) {
    return res.status(500).json({ codigo, mensaje });
  }

  if (codigo !== 1) {
    return res.status(400).json({ codigo, mensaje });
  }

  if (withData) {
    return res.status(200).json({
      codigo,
      mensaje,
      data: getSpData(results),
    });
  }

  return res.status(200).json({ codigo, mensaje });
};

const crearConstructora = async (req, res) => {
  const { nombre, nit } = req.body || {};

  if (!nombre?.trim() || !nit?.trim()) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Nombre y NIT son obligatorios.',
    });
  }

  try {
    const results = await callSp([
      1,
      null,
      null,
      nombre.trim(),
      nit.trim(),
      null,
    ]);
    return respondFromSp(res, results);
  } catch (error) {
    console.error('crearConstructora:', error);
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error interno al crear la constructora.',
      error: error.message,
    });
  }
};

const listarConstructorasInactivas = () =>
  new Promise((resolve, reject) => {
    db.query(
      `SELECT id_constructora,
              nombre,
              nit,
              estado,
              fecha_creacion
         FROM sosamet.constructoras
        WHERE estado = 'INACTIVO'
        ORDER BY nombre`,
      (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      }
    );
  });

const listarProyectosInactivos = (idConstructora) =>
  new Promise((resolve, reject) => {
    db.query(
      `SELECT id_proyecto,
              nombre,
              id_constructora,
              estado,
              fecha_creacion
         FROM sosamet.proyectos_constructoras
        WHERE id_constructora = ?
          AND estado = 'INACTIVO'
        ORDER BY nombre`,
      [idConstructora],
      (err, results) => {
        if (err) reject(err);
        else resolve(results || []);
      }
    );
  });

const listarConstructoras = async (req, res) => {
  const estado = String(req.query.estado || 'ACTIVO').toUpperCase();

  if (!['ACTIVO', 'INACTIVO'].includes(estado)) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Estado de consulta no válido.',
    });
  }

  try {
    if (estado === 'INACTIVO') {
      const data = await listarConstructorasInactivas();
      return res.status(200).json({
        codigo: 1,
        mensaje: 'Consulta realizada correctamente',
        data,
      });
    }

    const results = await callSp([2, null, null, null, null, null]);
    return respondFromSp(res, results, { withData: true });
  } catch (error) {
    console.error('listarConstructoras:', error);
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error interno al listar constructoras.',
      error: error.message,
    });
  }
};

const cambiarEstadoConstructora = async (req, res) => {
  const idConstructora = Number(req.params.idConstructora);
  const { estado } = req.body || {};

  if (!idConstructora) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Id de constructora inválido.',
    });
  }

  if (!['ACTIVO', 'INACTIVO'].includes(String(estado || '').toUpperCase())) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Estado no válido.',
    });
  }

  try {
    const results = await callSp([
      3,
      idConstructora,
      null,
      null,
      null,
      String(estado).toUpperCase(),
    ]);
    return respondFromSp(res, results);
  } catch (error) {
    console.error('cambiarEstadoConstructora:', error);
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error interno al actualizar la constructora.',
      error: error.message,
    });
  }
};

const crearProyecto = async (req, res) => {
  const idConstructora = Number(req.body?.id_constructora);
  const nombre = req.body?.nombre;

  if (!idConstructora || !nombre?.trim()) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Constructora y nombre del proyecto son obligatorios.',
    });
  }

  try {
    const results = await callSp([
      4,
      idConstructora,
      null,
      nombre.trim(),
      null,
      null,
    ]);
    return respondFromSp(res, results);
  } catch (error) {
    console.error('crearProyecto:', error);
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error interno al crear el proyecto.',
      error: error.message,
    });
  }
};

const listarProyectos = async (req, res) => {
  const idConstructora = Number(req.params.idConstructora);
  const estado = String(req.query.estado || 'ACTIVO').toUpperCase();

  if (!idConstructora) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Id de constructora inválido.',
    });
  }

  if (!['ACTIVO', 'INACTIVO'].includes(estado)) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Estado de consulta no válido.',
    });
  }

  try {
    if (estado === 'INACTIVO') {
      const data = await listarProyectosInactivos(idConstructora);
      return res.status(200).json({
        codigo: 1,
        mensaje: 'Consulta realizada correctamente',
        data,
      });
    }

    const results = await callSp([
      5,
      idConstructora,
      null,
      null,
      null,
      null,
    ]);
    return respondFromSp(res, results, { withData: true });
  } catch (error) {
    console.error('listarProyectos:', error);
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error interno al listar proyectos.',
      error: error.message,
    });
  }
};

const cambiarEstadoProyecto = async (req, res) => {
  const idProyecto = Number(req.params.idProyecto);
  const { estado } = req.body || {};

  if (!idProyecto) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Id de proyecto inválido.',
    });
  }

  if (!['ACTIVO', 'INACTIVO'].includes(String(estado || '').toUpperCase())) {
    return res.status(400).json({
      codigo: 0,
      mensaje: 'Estado no válido.',
    });
  }

  try {
    const estadoNormalizado = String(estado).toUpperCase();
    const results = await callSp([
      6,
      null,
      idProyecto,
      null,
      null,
      estadoNormalizado,
    ]);
    return respondFromSp(res, results);
  } catch (error) {
    console.error('cambiarEstadoProyecto:', error);
    return res.status(500).json({
      codigo: -1,
      mensaje: 'Error interno al actualizar el proyecto.',
      error: error.message,
    });
  }
};

module.exports = {
  crearConstructora,
  listarConstructoras,
  cambiarEstadoConstructora,
  crearProyecto,
  listarProyectos,
  cambiarEstadoProyecto,
};
