const express = require('express');
const router = express.Router();
const {
  consultRemissions,
  updateRemission,
  deleteRemissionDetalle,
  anularRemission,
  deleteRemission,
} = require('../../controllers/contracts/consultRemissions.controller');

/**
 * @swagger
 * tags:
 *   name: Remisiones
 *   description: Endpoints para consulta de remisiones
 */

router.get('/', consultRemissions);
router.post('/update', updateRemission);
router.post('/detalle/delete', deleteRemissionDetalle);
router.post('/anular', anularRemission);
router.post('/delete', deleteRemission);

module.exports = router;
