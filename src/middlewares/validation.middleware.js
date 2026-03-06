const { validationResult } = require('express-validator');

/**
 * Middleware que revisa los resultados de express-validator y,
 * si hay errores, responde 400 con un formato consistente.
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    code: 0,
    message: 'Datos de entrada no válidos',
    errors: errors.array().map((err) => ({
      field: err.param,
      message: err.msg,
    })),
  });
};

module.exports = {
  validateRequest,
};

