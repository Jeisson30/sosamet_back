const express = require('express');
const router = express.Router();
const {
  getProductionByContractPreview,
  exportProductionByContract,
  getCarteraPreview,
  getObrasActivasPreview,
  getMovimientosPreview,
  exportMovimientos,
} = require('../../controllers/reports/reports.controller');
const {
  getCostosPorInsumoPreview,
  exportCostosPorInsumo,
} = require('../../controllers/reports/costosPorInsumo.controller');

router.get('/production-by-contract/preview', getProductionByContractPreview);
router.get('/production-by-contract/export', exportProductionByContract);
router.get('/cartera/preview', getCarteraPreview);
router.get('/obras-activas/preview', getObrasActivasPreview);
router.get('/movimientos/preview', getMovimientosPreview);
router.get('/movimientos/export', exportMovimientos);
router.get('/costos-por-insumo/preview', getCostosPorInsumoPreview);
router.get('/costos-por-insumo/export', exportCostosPorInsumo);

module.exports = router;
