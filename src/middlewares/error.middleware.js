/**
 * Middleware global de manejo de errores.
 * No expone detalles internos al cliente en errores 5xx.
 */
const errorHandler = (err, req, res, next) => {
  // Log completo en servidor
  // eslint-disable-next-line no-console
  console.error('Error no controlado:', err);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.statusCode || err.status || 500;

  const response = {
    code: 0,
    message:
      status >= 500
        ? 'Error interno del servidor'
        : err.message || 'Error en la petición',
  };

  return res.status(status).json(response);
};

module.exports = {
  errorHandler,
};

