const express = require('express');
const upload = require('../../middlewares/upload.middleware');
const {
  insertContractWithPlano,
} = require('../../controllers/contracts/insertContractWithPlano.controller');

const router = express.Router();

router.post(
  '/insert-with-plano',
  upload.fields([
    { name: 'file_aiu', maxCount: 1 },
    { name: 'file_iva', maxCount: 1 },
  ]),
  insertContractWithPlano
);

module.exports = router;
