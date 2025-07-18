const db = require("../../config/db");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// Configuración (puedes mover esto a un archivo .env)
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.SERVER_LOCAL;

const transporter = nodemailer.createTransport({ 
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const createUser = (req, res) => {
    const {
        p_nombre,
        p_apellido,
        p_identificacion,
        p_email,
        p_idrol,
        p_idperfil,
    } = req.body;

    if (!p_nombre || !p_apellido || !p_identificacion || !p_email || !p_idrol) {
        return res
            .status(400)
            .json({ message: "Todos los campos son obligatorios" });
    }

    db.query(
        "CALL sp_insertar_usuario(?, ?, ?, ?, ?, ?)",
        [p_identificacion, p_nombre, p_apellido, p_email, p_idrol, p_idperfil],
        (err, results) => {
            if (err) {
                if (err.sqlState === "45000") {
                    return res.status(400).json({ message: err.message });
                }
                return res
                    .status(500)
                    .json({ message: "Error al crear usuario", error: err });
            }

            const message =
                results[0][0]?.message || "Usuario creado exitosamente";

            // ✅ Generar token con la cédula
            const token = jwt.sign(
                { identificacion: p_identificacion },
                JWT_SECRET,
                { expiresIn: "15m" }
            );

            // ✅ Armar link para frontend
            const link = `${FRONTEND_URL}/changePassword?token=${token}`;

            // ✅ Enviar correo
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: p_email,
                subject: "Crea tu contraseña - Sosamet",
                html: `
          <p>Hola ${p_nombre},</p>
          <p>Tu cuenta ha sido creada exitosamente.</p>
          <p>Haz clic en el siguiente enlace para crear tu contraseña:</p>
          <p><a href="${link}">${link}</a></p>
          <p><strong>Este enlace expirará en 15 minutos.</strong></p>
        `,
            };

            transporter.sendMail(mailOptions, (mailErr, info) => {
                if (mailErr) {
                    console.error("Error al enviar correo:", mailErr);
                    return res.status(500).json({
                        message:
                            "Usuario creado, pero no se pudo enviar el correo de creación de contraseña.",
                    });
                }

                res.status(201).json({
                    message: "Usuario creado y correo enviado exitosamente",
                });
            });
        }
    );
};

module.exports = { createUser };
