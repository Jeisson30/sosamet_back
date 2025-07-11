const express = require("express");
const router = express.Router();
const {
    getTypeFields,
} = require("../../controllers/contracts/getTypeFields.controller");

/**
 * @swagger
 * tags:
 *   name: Contratos
 *   description: Endpoints para gestión de contratos
 */

/**
 * @swagger
 * /api/contracts/getTypeFields/{type}:
 *   get:
 *     summary: Obtener los campos asociados a un tipo de contrato
 *     tags: [Contratos]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         description: 'Tipo de contrato/documento (ej: "Contrato", "Orden Produccion")'
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de campos asociados al tipo de documento
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   nombre_campo_doc:
 *                     type: string
 *                     example: Cedula_contratista
 *                   desc_campo_doc:
 *                     type: string
 *                     example: Crear la cedula del contratista
 *                   estadocampo:
 *                     type: string
 *                     example: "1"
 *       400:
 *         description: El parámetro 'type' es requerido
 *       404:
 *         description: No se encontraron campos para el tipo de documento
 *       500:
 *         description: Error del servidor al consultar los campos
 */
router.get("/:type", getTypeFields);

module.exports = router;
