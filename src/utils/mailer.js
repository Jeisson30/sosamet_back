const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return cachedTransporter;
}

async function sendMail({ to, subject, html }) {
  const transporter = getTransporter();
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    html,
  });
}

module.exports = { sendMail };

