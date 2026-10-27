const express = require('express');
const router = express.Router();
const {
  listarMemoriasDisponibles,
  getContexto,
  listar,
  obtener,
  guardar,
  finalizar,
  marcarPago,
  anular,
  eliminar,
} = require('../../controllers/contracts/actasPago.controller');

router.get('/memorias-disponibles', listarMemoriasDisponibles);
router.get('/contexto', getContexto);
router.get('/', listar);
router.get('/:id', obtener);
router.post('/', guardar);
router.post('/:id/finalizar', finalizar);
router.post('/:id/marcar-pago', marcarPago);
router.post('/:id/anular', anular);
router.delete('/:id', eliminar);

module.exports = router;
