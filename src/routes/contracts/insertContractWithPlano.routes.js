const express = require('express');
const uploadEvidence = require('../../middlewares/uploadEvidence.middleware');
const {
  insertContractWithPlano,
} = require('../../controllers/contracts/insertContractWithPlano.controller');

const router = express.Router();

// Excel (AIU/IVA) + adjuntos EAV (foto1, PDF, etc.) en la misma petición
router.post(
  '/insert-with-plano',
  uploadEvidence.any(),
  insertContractWithPlano
);

module.exports = router;
