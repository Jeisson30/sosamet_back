const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const {
  generarConsecutivo,
} = require("../../controllers/contracts/generarConsecutivo.controller");
const { validateRequest } = require("../../middlewares/validation.middleware");

/**
 * @swagger
 * /api/contracts/generar-consecutivo:
 *   post:
 *     summary: Generar consecutivo (SP_GENERAR_CONSECUTIVO)
 *     tags:
 *       - Contratos
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tipo
 *             properties:
 *               tipo:
 *                 type: string
 *                 example: ACTA_MEDIDA
 *     responses:
 *       200:
 *         description: Consecutivo generado
 *       400:
 *         description: No se pudo generar
 *       500:
 *         description: Error interno
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

module.exports = router;
