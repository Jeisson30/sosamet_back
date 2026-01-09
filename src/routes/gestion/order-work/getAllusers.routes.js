const express = require('express');
const router = express.Router();
const { getAllUsers } = require('../../../controllers/gestion/order-work/getAllUsers.controller');

/**
 * @swagger
 * tags:
 *   name: Gestión
 *   description: Endpoints del módulo de gestión
 */

/**
 * @swagger
 * /api/gestion/users:
 *   get:
 *     summary: Obtener listado de usuarios para gestión
 *     tags: [Gestión]
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_usuario:
 *                         type: integer
 *                         example: 4
 *                       identificacion:
 *                         type: string
 *                         example: "7318857"
 *                       nombre:
 *                         type: string
 *                         example: "Elkin Oc"
 *                       apellido:
 *                         type: string
 *                         example: "Peralta D"
 *                       email:
 *                         type: string
 *                         example: "elkinperalta@gmail.com"
 *                       id_perfil:
 *                         type: integer
 *                         example: 1
 *                       perfil:
 *                         type: string
 *                         example: "ADMINISTRADOR"
 *                       estado:
 *                         type: string
 *                         example: "ACTIVO"
 *                       fecha_creacion:
 *                         type: string
 *                         example: "2025-04-28 10:31:36"
 *                       fecha_actualizacion:
 *                         type: string
 *                         example: "2025-06-11 16:18:28"
 *       500:
 *         description: Error del servidor al consultar los usuarios
 */
router.get('/users', getAllUsers);

module.exports = router;
