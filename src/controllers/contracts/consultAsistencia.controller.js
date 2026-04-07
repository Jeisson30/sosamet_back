const db = require('../../config/db');

const consultAsistencia = (req, res) => {
  const {
    buscar = null,
    fecha_desde = null,
    fecha_hasta = null,
    trabajador = null,
    constructora = null,
    proyecto = null,
  } = req.query;

  const params = [
    buscar && String(buscar).trim() ? String(buscar).trim() : null,
    fecha_desde && String(fecha_desde).trim() ? String(fecha_desde).trim() : null,
    fecha_hasta && String(fecha_hasta).trim() ? String(fecha_hasta).trim() : null,
    trabajador && String(trabajador).trim() ? String(trabajador).trim() : null,
    constructora && String(constructora).trim() ? String(constructora).trim() : null,
    proyecto && String(proyecto).trim() ? String(proyecto).trim() : null,
  ];

  db.query('CALL SP_ConsultarAsistencia(?, ?, ?, ?, ?, ?)', params, (err, results) => {
    if (err) {
      return res.status(500).json({
        error: 'Error al consultar asistencias',
        detalle: err,
      });
    }

    const rows = results && results[0] ? results[0] : [];
    return res.status(200).json({ data: rows });
  });
};

const updateAsistencia = (req, res) => {
  if (!req.user || Number(req.user.id_perfil) !== 1) {
    return res.status(403).json({
      error: 'Solo administradores pueden actualizar asistencias.',
    });
  }

  const { numerodoc, campos } = req.body || {};

  if (!numerodoc || !String(numerodoc).trim()) {
    return res.status(400).json({ error: 'numerodoc es obligatorio.' });
  }

  if (!Array.isArray(campos) || campos.length === 0) {
    return res.status(400).json({ error: 'campos debe ser un arreglo no vacío.' });
  }

  const doc = String(numerodoc).trim();
  const camposJson = JSON.stringify(campos);

  db.query('CALL SP_ActualizarAsistencia(?, ?)', [doc, camposJson], (err) => {
    if (err) {
      return res.status(500).json({
        error: 'Error al actualizar asistencia',
        detalle: err,
      });
    }
    return res.status(200).json({ mensaje: 'Asistencia actualizada correctamente' });
  });
};

module.exports = { consultAsistencia, updateAsistencia };
