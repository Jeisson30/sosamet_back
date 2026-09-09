const express = require('express');
const router = express.Router();
const {
  consultContractsFull,
  updateContractFull,
  anularContrato,
  deleteContrato,
} = require('../../controllers/contracts/consultContracts.controller');

/**
 * @swagger
 * tags:
 *   name: ContratosFull
 *   description: Consulta y actualización de contratos (cabecera + detalle AIU / IVA)
 */

router.get('/', consultContractsFull);
router.post('/update', updateContractFull);
router.post('/anular', anularContrato);
router.post('/delete', deleteContrato);

module.exports = router;
