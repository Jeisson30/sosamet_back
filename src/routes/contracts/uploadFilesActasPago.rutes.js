const express = require("express");
const router = express.Router();
const upload = require("../../middlewares/upload.middleware");
const { uploadExcelActasPago } = require("../../controllers/contracts/uploadFilesActasPago.controller");

/**
 * @swagger
 * /api/contracts/upload-actas-pago:
 *   post:
 *     summary: Subir archivo Excel para insertar datos en actas_pago_plano
 *     tags:
 *       - Contratos
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: |
 *                   Archivo Excel (.xlsx o .xls) con los campos:
 *                   REF, NO CONTRATO, ITEM, CANT, UM, DESCRIPCION, VALOR BASE, VR TOTAL
 *               tipo_doc:
 *                 type: string
 *                 example: ACTAS DE PAGO
 *                 description: Tipo de documento (opcional)
 *     responses:
 *       200:
 *         description: Archivo de Actas de Pago procesado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Archivo de Actas de Pago procesado e insertado correctamente.
 *       400:
 *         description: Archivo no enviado o inválido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: No se recibió ningún archivo
 *       500:
 *         description: Error interno al procesar archivo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Error al procesar archivo de Actas de Pago
 */

router.post("/upload-actas-pago", upload.single("file"), uploadExcelActasPago);

module.exports = router;
