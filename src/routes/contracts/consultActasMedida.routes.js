const express = require("express");
const router = express.Router();
const {
  consultActasMedida,
  updateActasMedida,
  deleteActasMedida,
  anularActasMedida,
} = require("../../controllers/contracts/consultActasMedida.controller");

/**
 * @swagger
 * /api/contracts/actas-medida:
 *   get:
 *     summary: Consultar actas de medida (SP_CONSULTAR_ACTAS_MEDIDA)
 *     tags:
 *       - Contratos
 *     parameters:
 *       - in: query
 *         name: buscar
 *         schema:
 *           type: string
 *       - in: query
 *         name: constructora
 *         schema:
 *           type: string
 *       - in: query
 *         name: proyecto
 *         schema:
 *           type: string
 *       - in: query
 *         name: contrato
 *         schema:
 *           type: string
 *       - in: query
 *         name: fecha_desde
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: fecha_hasta
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Cabecera y detalle de actas de medida
 *       500:
 *         description: Error interno
 */
router.get("/", consultActasMedida);

/**
 * @swagger
 * /api/contracts/actas-medida/update:
 *   post:
 *     summary: Actualizar acta de medida (SP_ACTUALIZAR_ACTA_MEDIDA)
 *     tags:
 *       - Contratos
 *     responses:
 *       200:
 *         description: Acta actualizada
 *       400:
 *         description: Datos incompletos
 *       500:
 *         description: Error interno
 */
router.post("/update", updateActasMedida);

/**
 * @swagger
 * /api/contracts/actas-medida/delete:
 *   post:
 *     summary: Eliminar acta de medida (SP_ELIMINAR_ACTA_MEDIDA)
 *     tags:
 *       - Contratos
 *     responses:
 *       200:
 *         description: Acta eliminada
 *       400:
 *         description: Datos incompletos
 *       500:
 *         description: Error interno
 */
router.post("/delete", deleteActasMedida);

/**
 * @swagger
 * /api/contracts/actas-medida/anular:
 *   post:
 *     summary: Anular acta de medida (SP_ANULAR_ACTA_MEDIDA)
 *     tags:
 *       - Contratos
 *     responses:
 *       200:
 *         description: Acta anulada
 *       400:
 *         description: Datos incompletos
 *       500:
 *         description: Error interno
 */
router.post("/anular", anularActasMedida);

module.exports = router;
