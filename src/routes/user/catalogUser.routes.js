const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const {
  createCatalogUser,
  enableCatalogAccess,
} = require('../../controllers/users/createCatalogUser.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');

router.post(
  '/',
  [
    body('p_nombre').isString().trim().notEmpty(),
    body('p_apellido').isString().trim().notEmpty(),
    body('p_identificacion').isString().trim().notEmpty(),
    body('p_idperfil').notEmpty(),
    validateRequest,
  ],
  createCatalogUser
);

router.post(
  '/enable-access',
  [
    body('p_id_usuario').isInt({ min: 1 }),
    body('p_email').isEmail(),
    validateRequest,
  ],
  enableCatalogAccess
);

module.exports = router;
