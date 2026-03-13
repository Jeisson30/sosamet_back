const db = require('../../config/db');

const consultPurchaseOrders = (req, res) => {
  const {
    buscar = null,
    fecha_desde = null,
    fecha_hasta = null,
    estado = null,
    proyecto = null,
  } = req.query;

  const params = [
    buscar && buscar.trim() ? buscar.trim() : null,
    fecha_desde && fecha_desde.trim() ? fecha_desde.trim() : null,
    fecha_hasta && fecha_hasta.trim() ? fecha_hasta.trim() : null,
    estado && estado.trim() ? estado.trim() : null,
    proyecto && proyecto.trim() ? proyecto.trim() : null,
  ];

  db.query('CALL SP_ConsultarOrdenCompra(?, ?, ?, ?, ?)', params, (err, results) => {
    if (err) {
      return res.status(500).json({
        error: 'Error al consultar órdenes de compra',
        detalle: err,
      });
    }

    const rows = results && results[0] ? results[0] : [];
    return res.status(200).json({ data: rows });
  });
};

module.exports = { consultPurchaseOrders };

