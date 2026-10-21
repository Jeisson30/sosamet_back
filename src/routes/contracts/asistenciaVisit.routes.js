const express = require('express');
const router = express.Router();
const uploadEvidence = require('../../middlewares/uploadEvidence.middleware');
const {
  getOpenVisit,
  startVisit,
  finishVisit,
} = require('../../controllers/contracts/asistenciaVisit.controller');

router.get('/open', getOpenVisit);
router.post('/start', startVisit);
router.post('/finish', uploadEvidence.single('foto1'), finishVisit);

module.exports = router;
