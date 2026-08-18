const express = require('express');
const router = express.Router();
const { insertOrderWork } = require('../../../controllers/gestion/order-work/insertOrderWork.controller');
const {
  consultActasPlanosDisponiblesOt,
} = require('../../../controllers/gestion/order-work/consultActasPlanosDisponiblesOt.controller');
const {
  crearOrdenTrabajoAsignada,
} = require('../../../controllers/gestion/order-work/crearOrdenTrabajoAsignada.controller');
const {
  consultOrdenesTrabajo,
} = require('../../../controllers/gestion/order-work/consultOrdenesTrabajo.controller');
const {
  updateOrdenTrabajo,
  anularOrdenTrabajo,
  deleteOrdenTrabajo,
} = require('../../../controllers/gestion/order-work/mantOrdenesTrabajo.controller');

/**
 * @swagger
 * tags:
 *   name: Gestión
 *   description: Endpoints del módulo de Orden de Trabajo
 */

router.get('/actas-planos-disponibles', consultActasPlanosDisponiblesOt);
router.get('/consult', consultOrdenesTrabajo);
router.post('/update', updateOrdenTrabajo);
router.post('/anular', anularOrdenTrabajo);
router.post('/delete', deleteOrdenTrabajo);
router.post('/crear-asignada', crearOrdenTrabajoAsignada);
router.post('/create', insertOrderWork);

module.exports = router;
