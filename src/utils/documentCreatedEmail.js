const db = require('../config/db');
const { sendMail } = require('./mailer');

const RECIPIENTS = ['info@sosamet.com', 'jeda1989@gmail.com'];

function formatDateDDMMYYYY(date) {
  const d = date instanceof Date ? date : new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFrontendBaseUrl() {
  return process.env.SERVER_PROD || process.env.SERVER_LOCAL || '';
}

function buildDocumentLink({ tipo_doc, numerodoc }) {
  const base = getFrontendBaseUrl();
  if (!base) return '';
  const t = encodeURIComponent(String(tipo_doc ?? 'documento'));
  const n = encodeURIComponent(String(numerodoc ?? ''));
  // Link genérico (ajustable cuando haya ruta específica por tipo)
  return `${base}/dashboard/consult?tipo=${t}&num=${n}`;
}

async function getUserDisplayNameById(idUsuario) {
  if (!idUsuario) return '';
  const id = Number(idUsuario);
  if (!Number.isFinite(id)) return '';

  // Nota: la tabla esperada en este proyecto expone id_usuario, nombre, apellido.
  const rows = await new Promise((resolve, reject) => {
    db.query(
      'SELECT nombre, apellido FROM usuarios WHERE id_usuario = ? LIMIT 1',
      [id],
      (err, results) => {
        if (err) return reject(err);
        resolve(results);
      }
    );
  });

  const row = Array.isArray(rows) ? rows[0] : null;
  const nombre = row?.nombre ? String(row.nombre) : '';
  const apellido = row?.apellido ? String(row.apellido) : '';
  return `${nombre} ${apellido}`.trim();
}

function buildEmailHtml({ docDisplay, dateText, userName, link }) {
  const safeDoc = escapeHtml(docDisplay);
  const safeDate = escapeHtml(dateText);
  const safeUser = escapeHtml(userName || 'Usuario');
  const safeLink = escapeHtml(link || '');

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #222;">
      <p>Hola,</p>
      <p>Se ha registrado un nuevo <strong>${safeDoc}</strong> en el sistema.<br/>
      Por favor revisa los detalles en la plataforma.</p>

      <p style="margin-top: 14px;">
        🗂️ <strong>Documento:</strong> ${safeDoc}<br/>
        📅 <strong>Fecha de ingreso:</strong> ${safeDate}<br/>
        👤 <strong>Ingresado por:</strong> ${safeUser}
      </p>

      ${
        safeLink
          ? `<p>Accede aquí para consultarlo: <a href="${safeLink}">${safeLink}</a></p>`
          : `<p>Accede aquí para consultarlo: (enlace no configurado)</p>`
      }

      <p>Gracias,<br/>SOSAMET SAS.</p>
    </div>
  `;
}

/**
 * Envío best-effort: si falla, NO rompe el flujo del endpoint.
 */
async function notifyDocumentCreated({ reqUser, tipo_doc, numerodoc }) {
  const docDisplay = `${tipo_doc}${numerodoc ? ` ${numerodoc}` : ''}`.trim();
  const subject = `Nuevo ${docDisplay} ingresado al sistema`;
  const dateText = formatDateDDMMYYYY(new Date());
  const userName = await getUserDisplayNameById(reqUser?.id_usuario).catch(() => '');
  const link = buildDocumentLink({ tipo_doc, numerodoc });

  const html = buildEmailHtml({
    docDisplay,
    dateText,
    userName,
    link,
  });

  try {
    await sendMail({
      to: RECIPIENTS.join(','),
      subject,
      html,
    });
  } catch (e) {
    // No interrumpir el flujo principal
    console.error('Error enviando correo de creación de documento:', e?.message || e);
  }
}

module.exports = { notifyDocumentCreated };

