const db = require('../../config/db');

const consultRemissions = (req, res) => {
  const {
    buscar = null,
    fecha_desde = null,
    fecha_hasta = null,
    empresa_asociada = null,
    constructora = null,
    proyecto = null,
  } = req.query;

  const params = [
    buscar && buscar.trim() ? buscar.trim() : null,
    fecha_desde && fecha_desde.trim() ? fecha_desde.trim() : null,
    fecha_hasta && fecha_hasta.trim() ? fecha_hasta.trim() : null,
    empresa_asociada && String(empresa_asociada).trim()
      ? String(empresa_asociada).trim()
      : null,
    constructora && constructora.trim() ? constructora.trim() : null,
    proyecto && proyecto.trim() ? proyecto.trim() : null,
  ];

  db.query('CALL SP_ConsultarRemisiones(?, ?, ?, ?, ?, ?)', params, (err, results) => {
    if (err) {
      return res.status(500).json({
        error: 'Error al consultar remisiones',
        detalle: err,
      });
    }

    const rows = results && results[0] ? results[0] : [];
    return res.status(200).json({ data: rows });
  });
};

module.exports = { consultRemissions };

