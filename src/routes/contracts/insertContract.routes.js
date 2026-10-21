const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const {
  insertContract,
} = require("../../controllers/contracts/insertContract.controller");
const { validateRequest } = require("../../middlewares/validation.middleware");
const uploadEvidence = require("../../middlewares/uploadEvidence.middleware");

/**
 * JSON clásico o multipart (campos JSON + archivos con fieldname = nombre_campo_doc).
 */
function maybeMultipart(req, res, next) {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return uploadEvidence.any()(req, res, next);
  }
  return next();
}

/**
 * @swagger
 * /api/contracts/insert:
 *   post:
 *     summary: Insertar los datos de un documento/contrato
 *     tags: [Contratos]
 */
router.post(
  "/insert",
  maybeMultipart,
  [
    body("tipo_doc")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("El tipo de documento es obligatorio"),
    body("numerodoc")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("El número de documento es obligatorio"),
    body("campos").custom((value) => {
      if (Array.isArray(value)) return true;
      if (typeof value === "string") {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed) || parsed.length < 1) {
          throw new Error("Debe enviar al menos un campo");
        }
        return true;
      }
      throw new Error("Debe enviar al menos un campo");
    }),
    validateRequest,
  ],
  insertContract
);

module.exports = router;
