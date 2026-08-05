const express = require("express");
const router = express.Router();
const uploadEvidence = require("../../middlewares/uploadEvidence.middleware");
const {
  consultActasDisenador,
} = require("../../controllers/contracts/consultActasDisenador.controller");
const {
  finalizarActaMedida,
} = require("../../controllers/contracts/finalizarActaMedida.controller");

/**
 * @swagger
 * /api/contracts/actas-disenador:
 *   get:
 *     summary: Consultar actas asignadas al diseñador (SP_CONSULTAR_ACTAS_DISENADOR)
 *     tags:
 *       - Contratos
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: integer
 *         description: 1 pendiente, 2 finalizada, 3 anulada. Omitir o 0 = todos.
 *       - in: query
 *         name: id_disenador
 *         schema:
 *           type: integer
 *         description: Opcional. Por defecto el usuario autenticado.
 *     responses:
 *       200:
 *         description: Dashboard, cabecera y detalle
 *       401:
 *         description: Usuario no identificado
 *       500:
 *         description: Error interno
 */
router.get("/", consultActasDisenador);

/**
 * @swagger
 * /api/contracts/actas-disenador/finalizar:
 *   post:
 *     summary: Finalizar acta de medida (actualiza ítems + SP_FINALIZAR_ACTA_MEDIDA)
 *     tags:
 *       - Contratos
 *     responses:
 *       200:
 *         description: Acta finalizada
 *       400:
 *         description: Validación / SP rechazó la operación
 *       500:
 *         description: Error interno
 */
router.post("/finalizar", uploadEvidence.any(), finalizarActaMedida);

module.exports = router;
