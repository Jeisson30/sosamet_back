/**
 * Requiere id_perfil === 1 (administrador). Debe usarse después de authMiddleware.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || Number(req.user.id_perfil) !== 1) {
    return res.status(403).json({
      code: 0,
      message: 'Solo los administradores pueden acceder a informes.',
    });
  }
  next();
};

module.exports = { requireAdmin };
