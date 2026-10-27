const crypto = require('crypto');
const db = require('../../config/db');
const jwt = require('jsonwebtoken');
const {
  isPasswordPolicyOk,
  passwordPolicyMessage,
} = require('../../utils/passwordPolicy');

const JWT_SECRET = process.env.JWT_SECRET;

function isSyntheticCatalogEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .endsWith('@internal.local');
}

function sha256Hex(plain) {
  return crypto.createHash('sha256').update(String(plain), 'utf8').digest('hex');
}

/**
 * Alta / recuperación por link JWT.
 * Guarda el hash en Node (mismo algoritmo que loginUser) para evitar
 * desajustes de charset/SP que dejaban la clave “cambiada” pero inutilizable.
 */
const changePassword = (req, res) => {
  const { p_clave_actual, p_nueva_password, token } = req.body;

  if (!p_clave_actual || !p_nueva_password || !token) {
    return res.status(400).json({
      code: 0,
      message: 'Todos los campos son obligatorios',
    });
  }

  if (p_clave_actual !== p_nueva_password) {
    return res.status(400).json({
      code: 0,
      message: 'La nueva contraseña y la confirmación no coinciden.',
    });
  }

  if (!isPasswordPolicyOk(p_nueva_password)) {
    return res.status(400).json({
      code: 0,
      message: passwordPolicyMessage(),
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      code: 0,
      message: 'Token inválido o expirado',
    });
  }

  const identificacion = String(decoded.identificacion || '').trim();
  if (!identificacion) {
    return res.status(401).json({
      code: 0,
      message: 'Token inválido o expirado',
    });
  }

  const applyChange = (userId) => {
    const hash = sha256Hex(p_nueva_password);
    db.query(
      `UPDATE usuarios
          SET password = ?,
              fecha_actualizacion = CURRENT_TIMESTAMP,
              intentos_fallidos = 0
        WHERE id_usuario = ?`,
      [hash, userId],
      (updErr, result) => {
        if (updErr) {
          return res.status(500).json({
            code: 0,
            message: 'Error al actualizar la contraseña',
          });
        }
        if (!result?.affectedRows) {
          return res.status(400).json({
            code: 0,
            message: 'No se pudo actualizar la contraseña para este usuario.',
          });
        }
        return res.status(200).json({
          code: 1,
          message: 'CONTRASEÑA CAMBIADA',
        });
      }
    );
  };

  // Recuperación: token atado a identificación + email del mismo usuario.
  if (decoded.purpose === 'password_reset') {
    const tokenEmail = String(decoded.email || '')
      .trim()
      .toLowerCase();
    if (!tokenEmail || isSyntheticCatalogEmail(tokenEmail)) {
      return res.status(401).json({
        code: 0,
        message: 'Token inválido o expirado',
      });
    }

    db.query(
      `SELECT id_usuario, email, estado, IFNULL(account_mode, 'FULL') AS account_mode
         FROM usuarios
        WHERE TRIM(identificacion) = ?
        LIMIT 1`,
      [identificacion],
      (lookupErr, rows) => {
        if (lookupErr || !rows?.[0]) {
          return res.status(401).json({
            code: 0,
            message: 'Token inválido o expirado',
          });
        }

        const u = rows[0];
        const dbEmail = String(u.email || '')
          .trim()
          .toLowerCase();
        if (
          u.account_mode !== 'FULL' ||
          String(u.estado || '').toUpperCase() !== 'ACTIVO' ||
          dbEmail !== tokenEmail
        ) {
          return res.status(401).json({
            code: 0,
            message: 'Token inválido o expirado',
          });
        }

        return applyChange(u.id_usuario);
      }
    );
    return;
  }

  // Alta / habilitar acceso (token sin purpose).
  db.query(
    `SELECT id_usuario, estado, IFNULL(account_mode, 'FULL') AS account_mode
       FROM usuarios
      WHERE TRIM(identificacion) = ?
      LIMIT 1`,
    [identificacion],
    (lookupErr, rows) => {
      if (lookupErr || !rows?.[0]) {
        return res.status(401).json({
          code: 0,
          message: 'Token inválido o expirado',
        });
      }

      const u = rows[0];
      if (u.account_mode === 'DIRECTORY') {
        return res.status(403).json({
          code: 0,
          message: 'Este usuario de catálogo no puede definir contraseña de acceso.',
        });
      }

      return applyChange(u.id_usuario);
    }
  );
};

module.exports = { changePassword };
