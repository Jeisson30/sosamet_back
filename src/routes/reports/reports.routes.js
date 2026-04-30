const express = require('express');
const router = express.Router();
const {
  getProductionByContractPreview,
  exportProductionByContract,
  getCarteraPreview,
} = require('../../controllers/reports/reports.controller');

router.get('/production-by-contract/preview', getProductionByContractPreview);
router.get('/production-by-contract/export', exportProductionByContract);
router.get('/cartera/preview', getCarteraPreview);

module.exports = router;
