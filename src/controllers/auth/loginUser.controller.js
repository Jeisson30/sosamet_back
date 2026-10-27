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

  const emailNorm = String(p_email).trim();

  db.query('CALL sp_login_usuario(?, ?)', [emailNorm, p_password], (err, results) => {
    if (err) {
      
      const isProd = String(process.env.NODE_ENV || '')
        .toLowerCase()
        .includes('production');
      // eslint-disable-next-line no-console
      console.error('Error en sp_login_usuario:', err);
      return res.status(500).json({
        code: 0,
        message: isProd
          ? 'Error al ejecutar el procedimiento'
          : err.sqlMessage || err.message || 'Error al ejecutar el procedimiento',
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

      case 'LOGIN_OK': {
        const finishLogin = () => {
          if (!password_db) {
            return res.status(401).json({
              code: 0,
              message: 'Contraseña o usuario incorrecto',
            });
          }

          const isBcryptHash =
            password_db.startsWith('$2a$') ||
            password_db.startsWith('$2b$') ||
            password_db.startsWith('$2y$');

          if (isBcryptHash) {
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
                { id_usuario, id_perfil, id_rol, nombre_perfil },
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
                  id_rol,
                },
                token,
              });
            });
            return;
          }

          const sha256 = crypto
            .createHash('sha256')
            .update(p_password)
            .digest('hex');
          if (sha256 !== password_db) {
            return res.status(401).json({
              code: 0,
              message: 'Contraseña o usuario incorrecto',
            });
          }
          const token = jwt.sign(
            { id_usuario, id_perfil, id_rol, nombre_perfil },
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
              id_rol,
            },
            token,
          });
        };

        // DIRECTORY users must never authenticate (catalog-only).
        db.query(
          `SELECT IFNULL(account_mode, 'FULL') AS account_mode
             FROM usuarios WHERE id_usuario = ? LIMIT 1`,
          [id_usuario],
          (modeErr, modeRows) => {
            if (!modeErr && modeRows?.[0]?.account_mode === 'DIRECTORY') {
              return res.status(403).json({
                code: 0,
                message:
                  'Este usuario es de catálogo y no puede iniciar sesión en el sistema.',
              });
            }
            return finishLogin();
          }
        );
        break;
      }

      default:
        return res.status(500).json({
          code: 0,
          message: 'Estado no manejado: ' + resultado,
        });
    }
  });
};

module.exports = { loginUser };
