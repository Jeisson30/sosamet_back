const express = require('express');
const router = express.Router();
const {
  consultAsistencia,
  updateAsistencia,
} = require('../../controllers/contracts/consultAsistencia.controller');

router.get('/', consultAsistencia);
router.post('/update', updateAsistencia);

module.exports = router;
