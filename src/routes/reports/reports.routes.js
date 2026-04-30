const express = require('express');
const router = express.Router();
const {
  getProductionByContractPreview,
  exportProductionByContract,
  getCarteraPreview,
  getObrasActivasPreview,
} = require('../../controllers/reports/reports.controller');

router.get('/production-by-contract/preview', getProductionByContractPreview);
router.get('/production-by-contract/export', exportProductionByContract);
router.get('/cartera/preview', getCarteraPreview);
router.get('/obras-activas/preview', getObrasActivasPreview);

module.exports = router;
