const express = require('express');
const router = express.Router();
const {
  consultRemissions,
} = require('../../controllers/contracts/consultRemissions.controller');

/**
 * @swagger
 * tags:
 *   name: Remisiones
 *   description: Endpoints para consulta de remisiones
 */

/**
 * @swagger
 * /api/contracts/remissions:
 *   get:
 *     summary: Consultar remisiones
 *     tags: [Remisiones]
 *     parameters:
 *       - in: query
 *         name: buscar
 *         schema:
 *           type: string
 *         description: Búsqueda por palabra clave (contrato, remisión, orden de compra)
 *       - in: query
 *         name: fecha_desde
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha desde (YYYY-MM-DD)
 *       - in: query
 *         name: fecha_hasta
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha hasta (YYYY-MM-DD)
 *       - in: query
 *         name: empresa_asociada
 *         schema:
 *           type: string
 *         description: Empresa asociada (id o código)
 *       - in: query
 *         name: constructora
 *         schema:
 *           type: string
 *         description: Nombre de la constructora
 *       - in: query
 *         name: proyecto
 *         schema:
 *           type: string
 *         description: Nombre del proyecto
 *     responses:
 *       200:
 *         description: Lista de remisiones
 *       500:
 *         description: Error del servidor al consultar remisiones
 */

router.get('/', consultRemissions);

module.exports = router;

