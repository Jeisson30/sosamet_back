const express = require("express");
const router = express.Router();
const uploadEvidence = require("../../middlewares/uploadEvidence.middleware");
const {
  consultActasMedida,
  updateActasMedida,
  deleteActasMedida,
  anularActasMedida,
  deleteActaMedidaDetalle,
  updateArchivoActaMedida,
} = require("../../controllers/contracts/consultActasMedida.controller");

/**
 * @swagger
 * /api/contracts/actas-medida:
 *   get:
 *     summary: Consultar actas de medida (SP_CONSULTAR_ACTAS_MEDIDA)
 *     tags:
 *       - Contratos
 */
router.get("/", consultActasMedida);

/**
 * @swagger
 * /api/contracts/actas-medida/update:
 *   post:
 *     summary: Actualizar acta de medida (SP_ACTUALIZAR_ACTA_MEDIDA)
 *     tags:
 *       - Contratos
 */
router.post("/update", updateActasMedida);

/**
 * @swagger
 * /api/contracts/actas-medida/delete:
 *   post:
 *     summary: Eliminar acta de medida (SP_ELIMINAR_ACTA_MEDIDA)
 *     tags:
 *       - Contratos
 */
router.post("/delete", deleteActasMedida);

/**
 * @swagger
 * /api/contracts/actas-medida/anular:
 *   post:
 *     summary: Anular acta de medida (SP_ANULAR_ACTA_MEDIDA)
 *     tags:
 *       - Contratos
 */
router.post("/anular", anularActasMedida);

/** Eliminar un ítem de detalle (amd_id). */
router.post("/detalle/delete", deleteActaMedidaDetalle);

/** Subir/reemplazar archivo_acta (multipart). */
router.post("/archivo", uploadEvidence.any(), updateArchivoActaMedida);

module.exports = router;
