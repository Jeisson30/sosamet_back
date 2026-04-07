const express = require('express');
const router = express.Router();
const {
  consultContractsFull,
  updateContractFull,
} = require('../../controllers/contracts/consultContracts.controller');

/**
 * @swagger
 * tags:
 *   name: ContratosFull
 *   description: Consulta y actualización de contratos (cabecera + detalle AIU / IVA)
 */

router.get('/', consultContractsFull);
router.post('/update', updateContractFull);

module.exports = router;
