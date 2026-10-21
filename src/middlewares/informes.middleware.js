const { puedeAccederInformes } = require('../utils/permissions');

/**
 * Admin, Supervisor de Proyectos o Contabilidad (Excel INFORMES).
 */
const requireInformesAccess = (req, res, next) => {
  if (puedeAccederInformes(req.user)) {
    return next();
  }
  return res.status(403).json({
    code: 0,
    message:
      'Solo administradores, supervisores de proyectos y contabilidad pueden acceder a informes.',
  });
};

module.exports = { requireInformesAccess };
