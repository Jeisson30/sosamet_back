const express = require("express");
const router = express.Router();
const { getCompanies } = require("../../controllers/contracts/getCompanies.controller");

/**
 * @swagger
 * tags:
 *   name: Empresas
 *   description: Endpoints para gestión de empresas
 */

/**
 * @swagger
 * /api/contracts/getCompanies:
 *   get:
 *     summary: Obtener lista de empresas
 *     tags: [Contratos]
 *     responses:
 *       200:
 *         description: Lista de empresas registradas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   nombre_empresa:
 *                     type: string
 *                     example: "SOSAMET SAS"
 *                   nit:
 *                     type: string
 *                     example: "900111135-7"
 *                   estado:
 *                     type: integer
 *                     example: 1
 *       500:
 *         description: Error del servidor al consultar las empresas
 */
router.get("/getCompanies", getCompanies);

module.exports = router;
