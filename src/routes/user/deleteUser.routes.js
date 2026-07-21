const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { deleteUser } = require('../../controllers/users/deleteUser.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');

/**
 * @swagger
 * /api/deleteUser:
 *   post:
 *     summary: Eliminar un usuario
 *     tags: [Usuarios]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - p_id_usuario
 *             properties:
 *               p_id_usuario:
 *                 type: integer
 *                 example: 4
 *     responses:
 *       200:
 *         description: Resultado del procedimiento almacenado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 code:
 *                   type: integer
 *                   description: 1 = eliminado, 0 = no se pudo eliminar
 *       400:
 *         description: Parámetros inválidos
 *       500:
 *         description: Error del servidor
 */
router.post(
  '/',
  [
    body('p_id_usuario')
      .isInt({ min: 1 })
      .withMessage('El id de usuario debe ser numérico'),
    validateRequest,
  ],
  deleteUser
);

module.exports = router;
