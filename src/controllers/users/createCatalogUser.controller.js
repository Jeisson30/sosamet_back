const db = require('../../config/db');
const crypto = require('crypto');

const syntheticEmail = (identificacion) =>
  `catalog.${String(identificacion).trim()}@internal.local`;

/**
 * Creates a DIRECTORY user (catalog only): appears in selects, cannot login.
 * Does not send email. Sets estado=ACTIVO so SP_USUARIOS_SEL includes them.
 */
const createCatalogUser = (req, res) => {
  const {
    p_nombre,
    p_apellido,
    p_identificacion,
    p_idperfil,
    p_idrol,
  } = req.body || {};

  const nombre = String(p_nombre || '').trim();
  const apellido = String(p_apellido || '').trim();
  const identificacion = String(p_identificacion || '').trim();
  const idPerfil = Number(p_idperfil ?? p_idrol);

  if (!nombre || !apellido || !identificacion || !Number.isFinite(idPerfil) || idPerfil <= 0) {
    return res.status(400).json({
      code: 0,
      message: 'Nombre, apellido, identificación y perfil son obligatorios.',
    });
  }

  const email = syntheticEmail(identificacion);
  const idRol = idPerfil;

  db.query(
    `SELECT id_usuario FROM usuarios WHERE identificacion = ? OR email = ? LIMIT 1`,
    [identificacion, email],
    (errDup, dupRows) => {
      if (errDup) {
        return res.status(500).json({
          code: 0,
          message: 'Error al validar el usuario.',
          error: errDup.message,
        });
      }
      if (dupRows && dupRows.length) {
        return res.status(400).json({
          code: 0,
          message: 'Ya existe un usuario con esa identificación.',
        });
      }

      db.query(
        `INSERT INTO usuarios
           (identificacion, nombre, apellido, email, password, estado, account_mode)
         VALUES (?, ?, ?, ?, NULL, 'ACTIVO', 'DIRECTORY')`,
        [identificacion, nombre, apellido, email],
        (errIns, result) => {
          if (errIns) {
            if (errIns.code === 'ER_DUP_ENTRY') {
              return res.status(400).json({
                code: 0,
                message: 'Ya existe un usuario con esa identificación o correo interno.',
              });
            }
            if (errIns.code === 'ER_BAD_FIELD_ERROR') {
              return res.status(500).json({
                code: 0,
                message:
                  'Falta la columna account_mode. Ejecute el script 2026-10-20_usuarios_account_mode.sql',
              });
            }
            return res.status(500).json({
              code: 0,
              message: 'Error al crear el usuario de catálogo.',
              error: errIns.message,
            });
          }

          const idUsuario = result.insertId;
          db.query(
            `INSERT INTO r_usuarios_perfiles (id_usuario, id_perfil, id_rol)
             VALUES (?, ?, ?)`,
            [idUsuario, idPerfil, idRol],
            (errRel) => {
              if (errRel) {
                return res.status(500).json({
                  code: 0,
                  message:
                    'Usuario creado, pero no se pudo asignar el perfil. Revise r_usuarios_perfiles.',
                  error: errRel.message,
                  id_usuario: idUsuario,
                });
              }
              return res.status(201).json({
                code: 1,
                message: 'Usuario de catálogo creado correctamente.',
                id_usuario: idUsuario,
                account_mode: 'DIRECTORY',
              });
            }
          );
        }
      );
    }
  );
};

/**
 * Promotes DIRECTORY → FULL: real email, temp password, INACTIVO, send setup email.
 */
const enableCatalogAccess = (req, res) => {
  const jwt = require('jsonwebtoken');
  const nodemailer = require('nodemailer');

  const JWT_SECRET = process.env.JWT_SECRET;
  const FRONTEND_URL = process.env.SERVER_LOCAL;
  const idUsuario = Number(req.body?.p_id_usuario);
  const email = String(req.body?.p_email || '').trim().toLowerCase();

  if (!Number.isFinite(idUsuario) || idUsuario <= 0 || !email) {
    return res.status(400).json({
      code: 0,
      message: 'Id de usuario y correo electrónico son obligatorios.',
    });
  }

  db.query(
    `SELECT id_usuario, nombre, apellido, identificacion, IFNULL(account_mode,'FULL') AS account_mode
       FROM usuarios WHERE id_usuario = ? LIMIT 1`,
    [idUsuario],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          code: 0,
          message: 'Error al consultar el usuario.',
          error: err.message,
        });
      }
      const user = rows && rows[0];
      if (!user) {
        return res.status(404).json({ code: 0, message: 'Usuario no encontrado.' });
      }
      if (user.account_mode !== 'DIRECTORY') {
        return res.status(400).json({
          code: 0,
          message: 'Solo se puede habilitar acceso a usuarios de catálogo.',
        });
      }

      db.query(
        `SELECT id_usuario FROM usuarios WHERE email = ? AND id_usuario <> ? LIMIT 1`,
        [email, idUsuario],
        (errEmail, emailRows) => {
          if (errEmail) {
            return res.status(500).json({
              code: 0,
              message: 'Error al validar el correo.',
              error: errEmail.message,
            });
          }
          if (emailRows && emailRows.length) {
            return res.status(400).json({
              code: 0,
              message: 'El correo ya está registrado en otro usuario.',
            });
          }

          const tempHash = crypto.createHash('sha256').update('12345678').digest('hex');
          db.query(
            `UPDATE usuarios
                SET email = ?,
                    password = ?,
                    estado = 'INACTIVO',
                    account_mode = 'FULL'
              WHERE id_usuario = ? AND account_mode = 'DIRECTORY'`,
            [email, tempHash, idUsuario],
            (errUp) => {
              if (errUp) {
                return res.status(500).json({
                  code: 0,
                  message: 'Error al habilitar el acceso.',
                  error: errUp.message,
                });
              }

              const token = jwt.sign(
                { identificacion: user.identificacion },
                JWT_SECRET,
                { expiresIn: '24h' }
              );
              const link = `${FRONTEND_URL}/changePassword?token=${token}`;
              const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                  user: process.env.EMAIL_USER,
                  pass: process.env.EMAIL_PASS,
                },
              });

              transporter.sendMail(
                {
                  from: process.env.EMAIL_USER,
                  to: email,
                  subject: 'Crea tu contraseña - Sosamet',
                  html: `
          <p>Hola ${user.nombre},</p>
          <p>Se habilitó el acceso a tu cuenta en Sosamet.</p>
          <p>Haz clic en el siguiente enlace para crear tu contraseña:</p>
          <p><a href="${link}">${link}</a></p>
          <p><strong>Este enlace expirará en 24 Horas.</strong></p>
        `,
                },
                (mailErr) => {
                  if (mailErr) {
                    console.error('Error al enviar correo (enableCatalogAccess):', mailErr);
                    return res.status(500).json({
                      code: 0,
                      message:
                        'Acceso habilitado, pero no se pudo enviar el correo de creación de contraseña. Active el usuario manualmente tras definir la clave.',
                    });
                  }
                  return res.status(200).json({
                    code: 1,
                    message:
                      'Acceso habilitado. Se envió el correo para crear la contraseña. Active el usuario cuando corresponda.',
                  });
                }
              );
            }
          );
        }
      );
    }
  );
};

module.exports = { createCatalogUser, enableCatalogAccess, syntheticEmail };
