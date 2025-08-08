const express = require('express');
const router = express.Router();
const upload = require('../../middlewares/upload.middleware');
const { uploadExcel } = require('../../controllers/contracts/uploadFilesContracts.controller');

/**
 * @swagger
 * /api/contracts/upload-excel:
 *   post:
 *     summary: Cargar archivo Excel con hoja 'aiu' para insertar datos asociados a un contrato
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
 *                 description: Archivo Excel que contiene la hoja "aiu"
 *     responses:
 *       200:
 *         description: "Archivo procesado e insertado correctamente"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Archivo procesado e insertado correctamente
 *       400:
 *         description: "Error en la solicitud, por ejemplo: archivo no enviado o datos inválidos"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: No se subió ningún archivo
 *       500:
 *         description: "Error interno al procesar el archivo Excel"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Error al procesar el archivo Excel
 */


router.post('/upload-excel', upload.single('file'), uploadExcel);

module.exports = router;
