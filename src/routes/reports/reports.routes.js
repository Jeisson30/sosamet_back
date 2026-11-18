const express = require('express');
const router = express.Router();
const {
  getProductionByContractPreview,
  exportProductionByContract,
  getCarteraPreview,
  getObrasActivasPreview,
  getHistorialProyectosPreview,
  getMovimientosPreview,
  exportMovimientos,
  getSeguimientoContratoPreview,
  getAvanceProduccionContratoPreview,
} = require('../../controllers/reports/reports.controller');
const {
  getCostosPorInsumoPreview,
  exportCostosPorInsumo,
} = require('../../controllers/reports/costosPorInsumo.controller');
const {
  getBalanceContratoPreview,
  saveBalanceContratoItems,
} = require('../../controllers/reports/balanceContrato.controller');
const {
  getBalanceGlobalPreview,
  exportBalanceGlobal,
} = require('../../controllers/reports/balanceGlobal.controller');

router.get('/production-by-contract/preview', getProductionByContractPreview);
router.get('/production-by-contract/export', exportProductionByContract);
router.get('/cartera/preview', getCarteraPreview);
router.get('/obras-activas/preview', getObrasActivasPreview);
router.get('/historial-proyectos/preview', getHistorialProyectosPreview);
router.get('/balance-contrato/preview', getBalanceContratoPreview);
router.put('/balance-contrato/items', saveBalanceContratoItems);
router.get('/balance-global/preview', getBalanceGlobalPreview);
router.get('/balance-global/export', exportBalanceGlobal);
router.get('/movimientos/preview', getMovimientosPreview);
router.get('/movimientos/export', exportMovimientos);
router.get('/costos-por-insumo/preview', getCostosPorInsumoPreview);
router.get('/costos-por-insumo/export', exportCostosPorInsumo);
router.get('/seguimiento-contrato/preview', getSeguimientoContratoPreview);
router.get(
  '/avance-produccion-contrato/preview',
  getAvanceProduccionContratoPreview
);

module.exports = router;
