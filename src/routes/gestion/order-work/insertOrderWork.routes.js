const express = require('express');
const router = express.Router();
const { insertOrderWork } = require('../../../controllers/gestion/order-work/insertOrderWork.controller');

/**
 * @swagger
 * tags:
 *   name: Gestión
 *   description: Endpoints del módulo de Orden de Trabajo
 */

/**
 * @swagger
 * /api/gestion/order-work-create:
 *   post:
 *     summary: Crear una nueva orden de trabajo
 *     tags: [Gestión]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - consecutivo
 *               - empresa_asociada_id
 *               - encargado_id
 *               - fecha_entrega
 *               - items
 *             properties:
 *               consecutivo:
 *                 type: string
 *                 example: "OT-001"
 *               empresa_asociada_id:
 *                 type: integer
 *                 example: 1
 *               encargado_id:
 *                 type: integer
 *                 example: 5
 *               fecha_entrega:
 *                 type: string
 *                 format: date
 *                 example: "2026-02-28"
 *               observaciones:
 *                 type: string
 *                 example: "Observaciones generales"
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     ref:
 *                       type: string
 *                     no_contrato:
 *                       type: string
 *                     obra:
 *                       type: string
 *                     item:
 *                       type: string
 *                     descripcion:
 *                       type: string
 *                     cantidad:
 *                       type: number
 *                     um:
 *                       type: string
 *                     ancho:
 *                       type: number
 *                     alto:
 *                       type: number
 *                     observaciones:
 *                       type: string
 *     responses:
 *       200:
 *         description: Orden creada correctamente
 *       400:
 *         description: Datos incompletos
 *       500:
 *         description: Error interno
 */

router.post('/create', insertOrderWork);

module.exports = router;