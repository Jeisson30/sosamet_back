const express = require('express');
const router = express.Router();
const { insertLiquidationCourts } = require('../../../controllers/gestion/liquidation-courts/insertLiquidationCourts.controller')
/**
 * @swagger
 * tags:
 *   name: Gestión
 *   description: Endpoints del módulo de liquidación de corte
 */

/**
 * @swagger
 * /api/gestion/liquidation-courts:
 *   post:
 *     summary: Crear una nueva liquidación de corte
 *     tags: [Gestión]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - consecutivo
 *               - nombre_corte
 *               - empresa_asociada_id
 *               - encargado_id
 *               - items
 *             properties:
 *               consecutivo:
 *                 type: integer
 *                 example: 101
 *               nombre_corte:
 *                 type: string
 *                 example: "Corte Enero"
 *               empresa_asociada_id:
 *                 type: integer
 *                 example: 1
 *               encargado_id:
 *                 type: integer
 *                 example: 5
 *               observaciones:
 *                 type: string
 *                 example: "Observación general"
 *               resumen:
 *                 type: object
 *                 properties:
 *                   subtotal:
 *                     type: number
 *                     example: 100000
 *                   seguridad_social:
 *                     type: number
 *                     example: 5000
 *                   maquinaria_aseo:
 *                     type: number
 *                     example: 2000
 *                   casino:
 *                     type: number
 *                     example: 1000
 *                   prestamos:
 *                     type: number
 *                     example: 0
 *                   otros:
 *                     type: number
 *                     example: 500
 *                   total:
 *                     type: number
 *                     example: 108500
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     ref:
 *                       type: string
 *                       example: "REF001"
 *                     no_orden:
 *                       type: string
 *                       example: "ORD123"
 *                     no_contrato:
 *                       type: string
 *                       example: "CON456"
 *                     obra:
 *                       type: string
 *                       example: "Obra Norte"
 *                     item:
 *                       type: string
 *                       example: "Item 1"
 *                     descripcion:
 *                       type: string
 *                       example: "Descripción del item"
 *                     cantidad:
 *                       type: number
 *                       example: 10
 *                     um:
 *                       type: string
 *                       example: "m2"
 *                     ancho:
 *                       type: number
 *                       example: 2
 *                     alto:
 *                       type: number
 *                       example: 5
 *                     observaciones:
 *                       type: string
 *                       example: "Sin novedad"
 *                     vr_unitario:
 *                       type: number
 *                       example: 10000
 *                     vr_total:
 *                       type: number
 *                       example: 100000
 *     responses:
 *       200:
 *         description: Liquidación creada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: "Liquidación creada correctamente."
 *                 id_liquidacion:
 *                   type: integer
 *                   example: 15
 *       400:
 *         description: Datos incompletos
 *       500:
 *         description: Error interno del servidor
 */

router.post('/', insertLiquidationCourts);

module.exports = router;