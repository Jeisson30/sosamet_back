const db = require('../../config/db');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.SERVER_PROD || process.env.SERVER_LOCAL;
const RESET_EXPIRES_IN = '24h';

/** Misma respuesta siempre (anti-enumeración). */
const GENERIC_OK = {
  code: 1,
  message:
    'Si el correo está registrado en el sistema, enviamos un enlace para restablecer la contraseña. Revisa tu bandeja (y spam).',
};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function isSyntheticCatalogEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .endsWith('@internal.local');
}

const forgotPassword = (req, res) => {
  const emailRaw = String(req.body?.email || '').trim();
  if (!emailRaw || !emailRaw.includes('@')) {
    return res.status(400).json({
      code: 0,
      message: 'Ingresa un correo válido.',
    });
  }

  const emailNorm = emailRaw.toLowerCase();

  db.query(
    `SELECT id_usuario, identificacion, email, nombre, apellido, estado,
            IFNULL(account_mode, 'FULL') AS account_mode
       FROM usuarios
      WHERE LOWER(TRIM(email)) = ?
      LIMIT 1`,
    [emailNorm],
    (err, rows) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error('forgotPassword lookup:', err);
        return res.status(200).json(GENERIC_OK);
      }

      const user = rows?.[0];
      const canReset =
        user &&
        user.account_mode === 'FULL' &&
        String(user.estado || '').toUpperCase() === 'ACTIVO' &&
        !isSyntheticCatalogEmail(user.email) &&
        user.identificacion;

      if (!canReset) {
        return res.status(200).json(GENERIC_OK);
      }

      const token = jwt.sign(
        {
          identificacion: user.identificacion,
          email: String(user.email).trim().toLowerCase(),
          purpose: 'password_reset',
        },
        JWT_SECRET,
        { expiresIn: RESET_EXPIRES_IN }
      );

      const link = `${FRONTEND_URL}/changePassword?token=${token}`;
      const nombre = user.nombre || 'usuario';

      transporter.sendMail(
        {
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'Recupera tu contraseña - Sosamet',
          html: `
            <p>Hola ${nombre},</p>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta Sosamet.</p>
            <p>Haz clic en el siguiente enlace (válido solo para tu usuario):</p>
            <p><a href="${link}">${link}</a></p>
            <p><strong>Este enlace expirará en 24 horas.</strong></p>
            <p>Si no solicitaste este cambio, ignora este correo.</p>
          `,
        },
        (mailErr) => {
          if (mailErr) {
            // eslint-disable-next-line no-console
            console.error('forgotPassword mail:', mailErr);
          }
          return res.status(200).json(GENERIC_OK);
        }
      );
    }
  );
};

module.exports = { forgotPassword };
