const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { forgotPassword } = require('../../controllers/auth/forgotPassword.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');

router.post(
  '/',
  [
    body('email')
      .isString()
      .trim()
      .isEmail()
      .withMessage('Ingresa un correo válido.'),
    validateRequest,
  ],
  forgotPassword
);

module.exports = router;
