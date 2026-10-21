const express = require('express');
const router = express.Router();
const {
  consultAsistencia,
  updateAsistencia,
  anularAsistencia,
  deleteAsistencia,
} = require('../../controllers/contracts/consultAsistencia.controller');

router.get('/', consultAsistencia);
router.post('/update', updateAsistencia);
router.post('/anular', anularAsistencia);
router.post('/delete', deleteAsistencia);

module.exports = router;
