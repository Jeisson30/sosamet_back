const express = require('express');
const router = express.Router();
const { getUsers } = require('../../controllers/users/getUser.controller');

/**
 * @swagger
 * tags:
 *   name: Usuarios
 *   description: Endpoints para gestión de usuarios
 */

/**
 * @swagger
 * /api/getUsers:
 *   get:
 *     summary: Obtener lista de usuarios
 *     tags: [Usuarios]
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id_usuario:
 *                     type: integer
 *                     example: 4
 *                   identificacion:
 *                     type: string
 *                     example: "7318857"
 *                   nombre:
 *                     type: string
 *                     example: "elkin"
 *                   apellido:
 *                     type: string
 *                     example: "peralta"
 *                   email:
 *                     type: string
 *                     example: "elkinperalta2@gmail.com"
 *                   estado:
 *                     type: string
 *                     example: "ACTIVO"
 *                   id_perfil:
 *                     type: integer
 *                     example: 1
 *                   perfil:
 *                     type: string
 *                     example: "Administrador"
 *       500:
 *         description: Error del servidor al consultar los usuarios
 */
router.get('/', getUsers);

module.exports = router;
