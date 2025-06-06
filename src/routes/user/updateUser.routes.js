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
 *               - id_usuario
 *               - nombre
 *               - apellido
 *               - correo
 *               - identificacion
 *               - id_rol
 *             properties:
 *               id_usuario:
 *                 type: integer
 *                 example: 4
 *               nombre:
 *                 type: string
 *                 example: Juan
 *               apellido:
 *                 type: string
 *                 example: Pérez
 *               correo:
 *                 type: string
 *                 example: juan.perez@example.com
 *               identificacion:
 *                 type: string
 *                 example: 123456789
 *               id_rol:
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
