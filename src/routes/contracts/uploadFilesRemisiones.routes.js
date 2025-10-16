const express = require('express');
const router = express.Router();
const upload = require('../../middlewares/upload.middleware');
const { uploadExcelRemisiones } = require('../../controllers/contracts/uploadFilesRemisiones.controller');

/**
 * @swagger
 * /api/contracts/upload-remisiones:
 *   post:
 *     summary: Subir archivo Excel para insertar datos en remisiones_plano
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
 *                 description: Archivo Excel (.xlsx o .xls) con los campos ITEM, NO CONTRATO, CANTIDAD, UM, DETALLE, OBSERVACIONES
 *               tipo_doc:
 *                 type: string
 *                 example: Remisión
 *                 description: Tipo de documento (opcional)
 *     responses:
 *       200:
 *         description: Archivo de remisiones procesado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Archivo de remisiones procesado e insertado correctamente.
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
 *                   example: Error al procesar archivo de remisiones
 */

router.post('/upload-remisiones', upload.single('file'), uploadExcelRemisiones);

module.exports = router;
