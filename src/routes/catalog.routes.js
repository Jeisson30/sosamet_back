const express = require('express');
const router = express.Router();
const {
  getConstructoras,
  getProyectosByConstructora,
} = require('../controllers/catalog.controller');

/**
 * @swagger
 * tags:
 *   name: Catálogo
 *   description: Endpoints de catálogos (constructoras, proyectos, etc.)
 */

/**
 * @swagger
 * /api/catalog/constructoras:
 *   get:
 *     summary: Listar constructoras activas
 *     tags: [Catálogo]
 *     responses:
 *       200:
 *         description: Lista de constructoras
 */
router.get('/constructoras', getConstructoras);

/**
 * @swagger
 * /api/catalog/constructoras/{idConstructora}/proyectos:
 *   get:
 *     summary: Listar proyectos por constructora
 *     tags: [Catálogo]
 */
router.get('/constructoras/:idConstructora/proyectos', getProyectosByConstructora);

module.exports = router;

