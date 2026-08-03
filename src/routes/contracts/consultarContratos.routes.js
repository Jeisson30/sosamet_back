const express = require("express");
const router = express.Router();
const {
  consultarContratos,
} = require("../../controllers/contracts/consultarContratos.controller");

/**
 * @swagger
 * /api/contracts/consultar-contratos:
 *   get:
 *     summary: Listar números de contrato (SP_CONSULTAR_CONTRATOS)
 *     tags:
 *       - Contratos
 *     responses:
 *       200:
 *         description: Lista de contratos
 *       500:
 *         description: Error interno
 */
router.get("/consultar-contratos", consultarContratos);

module.exports = router;
