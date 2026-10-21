const { puedeAccederInventario } = require('../utils/permissions');

/**
 * Excel INVENTARIO: Admin, Auxiliar, Supervisor, Contabilidad,
 * Coordinador de Compras, Almacenista. Requiere JWT con nombre_perfil.
 */
const requireInventarioAccess = (req, res, next) => {
  if (puedeAccederInventario(req.user)) {
    return next();
  }
  return res.status(403).json({
    code: 0,
    message: 'No tiene permiso para acceder a inventario.',
  });
};

module.exports = { requireInventarioAccess };
