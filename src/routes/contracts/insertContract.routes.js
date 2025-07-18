const express = require("express");
const router = express.Router();
const {
  insertContract,
} = require("../../controllers/contracts/insertContract.controller");

/**
 * @swagger
 * tags:
 *   name: Contratos
 *   description: Endpoints para gestión de contratos
 */

/**
 * @swagger
 * /api/contracts/insert:
 *   post:
 *     summary: Insertar los datos de un documento/contrato
 *     tags: [Contratos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tipo_doc
 *               - numerodoc
 *               - campos
 *             properties:
 *               tipo_doc:
 *                 type: string
 *                 example: Contrato
 *               numerodoc:
 *                 type: string
 *                 example: CT-20250715-001
 *               campos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: Cedula_contratista
 *                     valor:
 *                       type: string
 *                       example: "123456789"
 *     responses:
 *       200:
 *         description: Inserción procesada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: Documento tipo "Contrato" procesado.
 *                 resultados:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       campo:
 *                         type: string
 *                         example: Cedula_contratista
 *                       mensaje:
 *                         type: string
 *                         example: SE REALIZO LA INSERCION CORRECTAMENTE.
 *       400:
 *         description: Datos inválidos
 *       500:
 *         description: Error interno del servidor
 */

router.post("/insert", insertContract);

module.exports = router;
