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
const {
  listarDocumentosNumero,
} = require("../../controllers/administracion/documentoNumero.controller");

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

/**
 * @swagger
 * /api/contracts/documentos-numero:
 *   get:
 *     summary: N° de documento registrados en Administración (solo lectura, cualquier perfil autenticado)
 *     tags:
 *       - Contratos
 *     parameters:
 *       - in: query
 *         name: id_proyecto
 *         schema: { type: integer }
 *       - in: query
 *         name: tipo_doc
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         schema: { type: string, default: ACTIVO }
 *     responses:
 *       200:
 *         description: Lista de N° documento (label/value, constructora, proyecto, tipo_doc)
 */
router.get("/documentos-numero", listarDocumentosNumero);

module.exports = router;
