const express = require('express');
const router = express.Router();
const {
  consultRemissions,
  updateRemission,
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

/**
 * @swagger
 * /api/contracts/remissions/update:
 *   post:
 *     summary: Actualizar remisión (cabecera, detalle o ambos)
 *     tags: [Remisiones]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               numerodoc:
 *                 type: string
 *               actualizar_cabecera:
 *                 type: boolean
 *               actualizar_detalle:
 *                 type: boolean
 *               tipo_doc_rem:
 *                 type: string
 *               numero_contrato:
 *                 type: string
 *               remision_material:
 *                 type: string
 *               fecha_remision:
 *                 type: string
 *               cliente:
 *                 type: string
 *               proyecto:
 *                 type: string
 *               despacho:
 *                 type: string
 *               transporto:
 *                 type: string
 *               empresa_asociada:
 *                 type: string
 *               direccion_empresa:
 *                 type: string
 *               orden_de_compra:
 *                 type: string
 *               item:
 *                 type: string
 *               empresa:
 *                 type: string
 *               cantidad:
 *                 type: number
 *               um:
 *                 type: string
 *               detalle:
 *                 type: string
 *               observaciones:
 *                 type: string
 *     responses:
 *       200:
 *         description: Remisión actualizada correctamente
 *       500:
 *         description: Error del servidor al actualizar remisión
 */

router.post('/update', updateRemission);

module.exports = router;

