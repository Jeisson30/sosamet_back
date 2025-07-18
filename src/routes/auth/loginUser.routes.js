const express = require('express');
const router = express.Router();
const { loginUser } = require('../../controllers/auth/loginUser.controller');

/**
 * @swagger
 * /api/auth/loginUser:
 *   post:
 *     summary: Iniciar sesión con email y contraseña
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - p_email
 *               - p_password
 *             properties:
 *               p_email:
 *                 type: string
 *                 format: email
 *                 example: usuario@ejemplo.com
 *               p_password:
 *                 type: string
 *                 example: claveSegura123
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 1
 *                 message:
 *                   type: string
 *                   example: LOGIN_OK
 *                 user:
 *                   type: object
 *                   properties:
 *                     id_usuario:
 *                       type: integer
 *                       example: 12
 *                     email:
 *                       type: string
 *                       example: usuario@ejemplo.com
 *                     token:
 *                       type: string
 *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Credenciales incorrectas o usuario no activo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: USUARIO_NO_ACTIVO
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: Error al ejecutar el procedimiento
 *                 error:
 *                   type: object
 */

router.post('/', loginUser);

module.exports = router;
