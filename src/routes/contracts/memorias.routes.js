const express = require('express');
const router = express.Router();
const {
  getContexto,
  listar,
  obtener,
  guardar,
  finalizar,
  anular,
  eliminar,
} = require('../../controllers/contracts/memorias.controller');

router.get('/contexto', getContexto);
router.get('/', listar);
router.get('/:id', obtener);
router.post('/', guardar);
router.post('/:id/finalizar', finalizar);
router.post('/:id/anular', anular);
router.delete('/:id', eliminar);

module.exports = router;
