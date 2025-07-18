const express = require('express');
const router = express.Router();
const { getTypeContracts } = require('../../controllers/contracts/getTypeContracts.controller');

/**
 * @swagger
 * tags:
 *   name: Contratos
 *   description: Endpoints para gestión de contratos
 */

/**
 * @swagger
 * /api/contracts/getTypeContracts:
 *   get:
 *     summary: Obtener lista de tipos de contratos
 *     tags: [Contratos]
 *     responses:
 *       200:
 *         description: Lista de tipos de contrato
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   tipo_doc:
 *                     type: string
 *                     example: "contrato"
 *       500:
 *         description: Error del servidor al consultar los tipos de contrato
 */
router.get('/', getTypeContracts);

module.exports = router;
