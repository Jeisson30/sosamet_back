const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRES_IN = '2h';

const loginUser = (req, res) => {
  const { p_email, p_password } = req.body;

  if (!p_email || !p_password) {
    return res.status(400).json({
      code: 0,
      message: 'Completa todos los campos',
    });
  }

  db.query('CALL sp_login_usuario(?, ?)', [p_email, p_password], (err, results) => {
    if (err) {
      console.error("ERROR SP LOGIN:", err);
    
      return res.status(500).json({
        code: 0,
        message: err.message,
        sqlMessage: err.sqlMessage,
        sqlState: err.sqlState,
        codeSql: err.code
      });
    }

    const result = results[0]?.[0];

    if (!result || !result.resultado) {
      return res.status(500).json({
        code: 0,
        message: 'Error inesperado en la respuesta del procedimiento',
      });
    }

    const { resultado, id_usuario, password_db, nombre, apellido, id_perfil, nombre_perfil, id_rol  } = result;

    console.log("RESULTADO SP:", result);
    switch (resultado) {
      case 'USUARIO_NO_EXISTE':
        return res.status(404).json({
          code: 0,
          message: 'Contraseña o usuario incorrecto',
        });

      case 'USUARIO_NO_ACTIVO':
        return res.status(403).json({
          code: 0,
          message: 'El usuario no está activo',
        });

      case 'LOGIN_OK':
        // Determinar si el hash es bcrypt o SHA-256 (bcrypt comienza con $2a$, $2b$, etc.)
        const isBcryptHash = password_db.startsWith('$2a$') || password_db.startsWith('$2b$') || password_db.startsWith('$2y$');

        if (isBcryptHash) {
          // Validación con bcrypt
          bcrypt.compare(p_password, password_db, (bcryptErr, isMatch) => {
            if (bcryptErr) {
              return res.status(500).json({
                code: 0,
                message: 'Error al validar la contraseña',
              });
            }

            if (!isMatch) {
              return res.status(401).json({
                code: 0,
                message: 'Contraseña o usuario incorrecto',
              });
            }

            const token = jwt.sign(
              { id_usuario, id_perfil, id_rol },
              JWT_SECRET,
              { expiresIn: TOKEN_EXPIRES_IN }
            );

            return res.status(200).json({
              code: 1,
              message: 'Inicio de sesión exitoso',
              user: {
                id_usuario,
                email: p_email,
                nombre,
                apellido,
                id_perfil,
                nombre_perfil,
                id_rol
              },
              token,
            });
          });
        } else {
          // Validación con SHA-256
          const sha256 = crypto.createHash('sha256').update(p_password).digest('hex');

          if (sha256 !== password_db) {
            return res.status(401).json({
              code: 0,
              message: 'Contraseña o usuario incorrecto',
            });
          }

          const token = jwt.sign(
            { id_usuario, id_perfil, id_rol },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRES_IN }
          );

          return res.status(200).json({
            code: 1,
            message: 'Inicio de sesión exitoso',
            user: {
              id_usuario,
              email: p_email,
              nombre,
              apellido,
              id_perfil,
              nombre_perfil,
              id_rol
            },
            token,
          });
        }
        break;

      default:
        return res.status(500).json({
          code: 0,
          message: 'Estado no manejado: ' + resultado,
        });
    }
  });
};

module.exports = { loginUser };
