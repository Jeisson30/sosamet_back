const express = require("express");
const router = express.Router();
const { updateUser } = require("../../controllers/users/updateUser.controller");

/**
 * @swagger
 * /api/updateUser:
 *   put:
 *     summary: Actualizar información de un usuario
 *     tags: [Usuarios]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - p_nit
 *               - p_nombre
 *               - p_apellido
 *               - p_email
 *               - p_rol
 *             properties:
 *               p_nit:
 *                 type: string
 *                 example: 123456789
 *               p_nombre:
 *                 type: string
 *                 example: Juan
 *               p_apellido:
 *                 type: string
 *                 example: Pérez
 *               p_email:
 *                 type: string
 *                 example: juan.perez@example.com
 *               p_rol:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       200:
 *         description: Usuario actualizado correctamente
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
 *                   example: Usuario actualizado correctamente
 *       400:
 *         description: Faltan parámetros requeridos o error de negocio
 *       500:
 *         description: Error del servidor al actualizar usuario
 */

router.put("/", updateUser);

module.exports = router;
