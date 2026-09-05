const express = require('express');
const router = express.Router();
const {
  finalizarEjecucionCortes,
  consultItemsCompletados,
  guardarAdicionalesOt,
  consultAdicionalesOt,
  consultTrazabilidadOt,
  consultEjecucionesCorte,
  updateEjecucionCorte,
  anularEjecucionCorte,
  deleteEjecucionCorte,
} = require('../../../controllers/gestion/ejecucion-cortes/ejecucionCortes.controller');

/**
 * @swagger
 * tags:
 *   name: Ejecución Cortes
 *   description: Finalización y consulta de ejecución sobre OT
 */

router.get('/completados', consultItemsCompletados);
router.get('/adicionales', consultAdicionalesOt);
router.get('/trazabilidad/:id_order_work', consultTrazabilidadOt);
router.get('/consult', consultEjecucionesCorte);
router.post('/adicionales', guardarAdicionalesOt);
router.post('/finalizar', finalizarEjecucionCortes);
router.post('/update', updateEjecucionCorte);
router.post('/anular', anularEjecucionCorte);
router.post('/delete', deleteEjecucionCorte);

module.exports = router;
