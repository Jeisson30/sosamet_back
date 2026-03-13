const express = require("express");
const router = express.Router();
const {
  consultPurchaseOrders,
} = require("../../controllers/contracts/consultPurchaseOrders.controller");

/**
 * @swagger
 * tags:
 *   name: Órdenes de Compra
 *   description: Endpoints para consulta de órdenes de compra
 */

/**
 * @swagger
 * /api/contracts/purchase-orders:
 *   get:
 *     summary: Consultar órdenes de compra
 *     tags: [Órdenes de Compra]
 *     parameters:
 *       - in: query
 *         name: buscar
 *         schema:
 *           type: string
 *         description: Búsqueda por palabra clave (consecutivo, contrato, constructora, proyecto)
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
 *         name: estado
 *         schema:
 *           type: string
 *         description: Estado de la orden (En Revisión, Procesado, Aprobado)
 *       - in: query
 *         name: proyecto
 *         schema:
 *           type: string
 *         description: Nombre del proyecto
 *     responses:
 *       200:
 *         description: Lista de órdenes de compra
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Error del servidor al consultar órdenes de compra
 */

router.get("/", consultPurchaseOrders);

module.exports = router;

