const express = require("express");
const router = express.Router();
const uploadEvidence = require("../../middlewares/uploadEvidence.middleware");
const {
  insertActasMedidaDetalle,
} = require("../../controllers/contracts/insertActasMedidaDetalle.controller");

/**
 * @swagger
 * /api/contracts/actas-medida-detalle:
 *   post:
 *     summary: Insertar ítems de Actas de Medida (sp_insertar_actas_medida_plano)
 *     tags:
 *       - Contratos
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - consecutivo
 *               - numero_contrato
 *               - items
 *             properties:
 *               consecutivo:
 *                 type: string
 *               numero_contrato:
 *                 type: string
 *               items:
 *                 type: string
 *                 description: JSON array con item, detalle, cantidad, um, ancho, alto, observaciones
 *     responses:
 *       200:
 *         description: Ítems insertados
 *       400:
 *         description: Datos incompletos
 *       500:
 *         description: Error interno
 */
router.post(
  "/actas-medida-detalle",
  uploadEvidence.any(),
  insertActasMedidaDetalle
);

module.exports = router;
