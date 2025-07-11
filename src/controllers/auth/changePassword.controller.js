const db = require('../../config/db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

const changePassword = (req, res) => {
  const { p_clave_actual, p_nueva_password, token } = req.body;

  // Validar campos
  if (!p_clave_actual || !p_nueva_password || !token) {
    return res.status(400).json({
      code: 0,
      message: 'Todos los campos son obligatorios',
    });
  }

  // Verificar y decodificar el token
  let p_id_usuario;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    p_id_usuario = decoded.identificacion;
  } catch (err) {
    return res.status(401).json({
      code: 0,
      message: 'Token inválido o expirado',
    });
  }

  // Ejecutar SP con los parámetros correctos
  db.query(
    'CALL sp_cambiar_password(?, ?, ?, @p_estado)',
    [p_id_usuario, p_clave_actual, p_nueva_password],
    (err) => {
      if (err) {
        return res.status(500).json({
          code: 0,
          message: 'Error al ejecutar el procedimiento',
          error: err,
        });
      }

      db.query('SELECT @p_estado AS estado', (err2, results2) => {
        if (err2) {
          return res.status(500).json({
            code: 0,
            message: 'Error al obtener el estado',
            error: err2,
          });
        }

        const estado = results2[0]?.estado;

        if (estado === 'CONTRASEÑA CAMBIADA') {
          return res.status(200).json({
            code: 1,
            message: estado,
          });
        } else {
          return res.status(400).json({
            code: 0,
            message: estado,
          });
        }
      });
    }
  );
};

module.exports = { changePassword };
