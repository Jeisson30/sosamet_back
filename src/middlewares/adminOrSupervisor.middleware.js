/**
 * Requiere id_perfil === 1 (administrador) o === 2 (supervisor de proyectos).
 * Debe usarse después de authMiddleware.
 */
const requireAdminOrSupervisor = (req, res, next) => {
  const idPerfil = Number(req.user?.id_perfil);
  if (idPerfil === 1 || idPerfil === 2) {
    return next();
  }

  return res.status(403).json({
    code: 0,
    message: 'Solo administradores y supervisores de proyectos pueden acceder.',
  });
};

module.exports = { requireAdminOrSupervisor };
