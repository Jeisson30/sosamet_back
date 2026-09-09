const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const {
  generarConsecutivo,
  siguienteConsecutivo,
} = require("../../controllers/contracts/generarConsecutivo.controller");
const { validateRequest } = require("../../middlewares/validation.middleware");

/**
 * @swagger
 * /api/contracts/generar-consecutivo:
 *   post:
 *     summary: Generar consecutivo (SP_GENERAR_CONSECUTIVO)
 *     tags:
 *       - Contratos
 */
router.post(
  "/generar-consecutivo",
  [
    body("tipo")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("El tipo es obligatorio (ej. ACTA_MEDIDA)"),
    validateRequest,
  ],
  generarConsecutivo
);

/**
 * Peek del siguiente consecutivo (no consume contador).
 * GET/POST /api/contracts/siguiente-consecutivo
 *  - tipo=ACTAS_DE_MEDIDA
 *  - tipo=REMISIONES&empresa_asociada=1|2
 */
router.get("/siguiente-consecutivo", siguienteConsecutivo);
router.post("/siguiente-consecutivo", siguienteConsecutivo);

module.exports = router;
