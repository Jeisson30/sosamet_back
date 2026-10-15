const express = require('express');
const router = express.Router();
const {
  listarContratosActivos,
  contextoContrato,
  registrarOtroSi,
  editarOtroSi,
  anularOtroSi,
  eliminarOtroSi,
  listarOtrosSi,
  detalleOtroSi,
} = require('../../controllers/contracts/otroSi.controller');

/**
 * @swagger
 * tags:
 *   name: OtroSi
 *   description: Otro Sí de contratos (prórroga de fecha y/o aumento de cantidades)
 */

router.get('/contratos', listarContratosActivos);
router.get('/contratos/:numerodoc', contextoContrato);
router.get('/', listarOtrosSi);
router.post('/', registrarOtroSi);
router.get('/:id', detalleOtroSi);
router.put('/:id', editarOtroSi);
router.post('/:id/anular', anularOtroSi);
router.delete('/:id', eliminarOtroSi);

module.exports = router;
