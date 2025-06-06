const express = require('express');
const router = express.Router();
const { getRoles } = require('../controllers/role.controller');

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Endpoints para obtener los roles del sistema
 */

/**
 * @swagger
 * /api/roles:
 *   get:
 *     summary: Obtener lista de roles
 *     tags: [Roles]
 *     responses:
 *       200:
 *         description: Lista de roles disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   value:
 *                     type: integer
 *                     example: 1
 *                   label:
 *                     type: string
 *                     example: Administrador
 *       500:
 *         description: Error del servidor al consultar los roles
 */
router.get('/', getRoles);

module.exports = router;
