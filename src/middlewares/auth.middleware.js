const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware de autenticación: verifica JWT en header Authorization (Bearer) y asigna req.user.
 * Responde 401 si no hay token o es inválido.
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 0,
      message: 'Acceso no autorizado. Token requerido.',
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id_usuario: decoded.id_usuario,
      id_perfil: decoded.id_perfil,
      id_rol: decoded.id_rol,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      code: 0,
      message: 'Token inválido o expirado.',
    });
  }
};

module.exports = { authMiddleware };
