const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { changePassword } = require('../../controllers/auth/changePassword.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');

/**
 * @swagger
 * tags:
 *   name: Autenticación
 *   description: Endpoints relacionados con autenticación y gestión de contraseñas
 */

/**
 * @swagger
 * /api/auth/changePassword:
 *   post:
 *     summary: Cambiar la contraseña de un usuario
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - p_id_usuario
 *               - p_clave_actual
 *               - p_nueva_password
 *             properties:
 *               p_id_usuario:
 *                 type: integer
 *                 example: 12
 *               p_clave_actual:
 *                 type: string
 *                 example: claveAnterior123
 *               p_nueva_password:
 *                 type: string
 *                 example: nuevaClaveSegura456
 *     responses:
 *       200:
 *         description: Contraseña cambiada exitosamente
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
 *                   example: CONTRASEÑA CAMBIADA
 *       400:
 *         description: Error de validación o clave incorrecta
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
 *                   example: CLAVE ACTUAL INCORRECTA
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
 *                   example: Error al cambiar la contraseña
 *                 error:
 *                   type: object
 */

router.post(
  '/',
  [
    body('token')
      .isString()
      .withMessage('El token es obligatorio'),
    body('p_clave_actual')
      .isString()
      .isLength({ min: 6 })
      .withMessage('La clave actual debe tener al menos 6 caracteres'),
    body('p_nueva_password')
      .isString()
      .isLength({ min: 8 })
      .withMessage('La nueva contraseña debe tener al menos 8 caracteres'),
    validateRequest,
  ],
  changePassword
);

module.exports = router;
