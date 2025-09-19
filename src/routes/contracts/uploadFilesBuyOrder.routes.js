const express = require("express");
const router = express.Router();
const upload = require("../../middlewares/upload.middleware");
const { uploadExcelOrder } = require("../../controllers/contracts/uploadFilesBuyOrder.controller");

/**
 * @swagger
 * /api/contracts/upload-purchase-order:
 *   post:
 *     summary: Subir archivo Excel para insertar datos de Orden de Compra
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
 *                 description: Archivo Excel (.xlsx o .xls)
 *     responses:
 *       200:
 *         description: Archivo procesado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Archivo de Orden de Compra procesado e insertado correctamente
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
 *                   example: Error interno al procesar archivo de Orden de Compra
 */

router.post("/upload-purchase-order", upload.single("file"), uploadExcelOrder);

module.exports = router;
