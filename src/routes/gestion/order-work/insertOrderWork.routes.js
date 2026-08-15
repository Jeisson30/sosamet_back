const express = require('express');
const router = express.Router();
const { insertOrderWork } = require('../../../controllers/gestion/order-work/insertOrderWork.controller');
const {
  consultActasPlanosDisponiblesOt,
} = require('../../../controllers/gestion/order-work/consultActasPlanosDisponiblesOt.controller');
const {
  crearOrdenTrabajoAsignada,
} = require('../../../controllers/gestion/order-work/crearOrdenTrabajoAsignada.controller');

/**
 * @swagger
 * tags:
 *   name: Gestión
 *   description: Endpoints del módulo de Orden de Trabajo
 */

router.get('/actas-planos-disponibles', consultActasPlanosDisponiblesOt);
router.post('/crear-asignada', crearOrdenTrabajoAsignada);
router.post('/create', insertOrderWork);

module.exports = router;
