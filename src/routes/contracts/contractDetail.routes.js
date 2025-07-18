const express = require("express");
const router = express.Router();
const {
  getContractDetail,
} = require("../../controllers/contracts/contractDetail.controller");

/**
 * @swagger
 * tags:
 *   name: Contratos
 *   description: Endpoints para gestión de contratos
 */

/**
 * @swagger
 * /api/contracts/detail/{tipo_doc}/{numerodoc}:
 *   get:
 *     summary: Consultar detalle de un documento/contrato por tipo y número
 *     tags: [Contratos]
 *     parameters:
 *       - in: path
 *         name: tipo_doc
 *         required: true
 *         schema:
 *           type: string
 *         description: Tipo del documento (ej. Contrato)
 *         example: Contrato
 *       - in: path
 *         name: numerodoc
 *         required: true
 *         schema:
 *           type: string
 *         description: Número del documento (ej. CT-20250715-001)
 *         example: CT-20250715-001
 *     responses:
 *       200:
 *         description: Documento encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: Detalle del documento tipo "Contrato" con número "CT-20250715-001".
 *                 data:
 *                   type: object
 *                   example:
 *                     tipo_doc: Contrato
 *                     numerodoc: CT-20250715-001
 *                     Cedula_contratista: "123456789"
 *                     empresa: "Constructora Ejemplo S.A.S"
 *       404:
 *         description: No se encontró el documento solicitado
 *       500:
 *         description: Error interno del servidor
 */

router.get("/detail/:tipo_doc/:numerodoc", getContractDetail);

module.exports = router;
