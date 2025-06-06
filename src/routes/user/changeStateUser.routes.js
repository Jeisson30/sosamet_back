const express = require("express");
const router = express.Router();
const {
    changeStateUser,
} = require("../../controllers/users/changeStateUser.controller");

/**
 * @swagger
 * /api/changeStateUser:
 *   post:
 *     summary: Cambiar el estado de un usuario
 *     tags: [Usuarios]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - p_id_usuario
 *               - p_nuevo_estado
 *             properties:
 *               p_id_usuario:
 *                 type: integer
 *                 example: 4
 *               p_nuevo_estado:
 *                 type: string
 *                 enum: [ACTIVO, INACTIVO, BLOQUEADO, ELIMINADO]
 *                 example: ACTIVO
 *     responses:
 *       200:
 *         description: Estado cambiado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: ESTADO CAMBIADO A ACTIVO
 *       400:
 *         description: Faltan parámetros requeridos o error de negocio
 *       500:
 *         description: Error del servidor al actualizar usuario
 */

router.post("/", changeStateUser);

module.exports = router;
