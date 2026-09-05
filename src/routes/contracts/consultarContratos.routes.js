const express = require("express");
const router = express.Router();
const {
  consultarContratos,
} = require("../../controllers/contracts/consultarContratos.controller");
const {
  consultarContratosFiltrados,
  getContextoActaMedida,
  upsertGrillaActaContrato,
} = require("../../controllers/contracts/actaMedidaContexto.controller");

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
router.get("/contratos-filtrados", consultarContratosFiltrados);
router.get("/contexto-acta-medida", getContextoActaMedida);
router.post("/grilla-acta-contrato", upsertGrillaActaContrato);

module.exports = router;
