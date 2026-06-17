const express = require('express');
const { body } = require('express-validator');
const { validateRequest } = require('../../middlewares/validation.middleware');
const {
  crearConstructora,
  listarConstructoras,
  cambiarEstadoConstructora,
  crearProyecto,
  listarProyectos,
  cambiarEstadoProyecto,
} = require('../../controllers/administracion/administracion.controller');

const router = express.Router();

router.get('/constructoras', listarConstructoras);

router.post(
  '/constructoras',
  [
    body('nombre').isString().trim().notEmpty().withMessage('El nombre es obligatorio'),
    body('nit').isString().trim().notEmpty().withMessage('El NIT es obligatorio'),
    validateRequest,
  ],
  crearConstructora
);

router.patch(
  '/constructoras/:idConstructora/estado',
  [
    body('estado')
      .trim()
      .toUpperCase()
      .isIn(['ACTIVO', 'INACTIVO'])
      .withMessage('Estado debe ser ACTIVO o INACTIVO'),
    validateRequest,
  ],
  cambiarEstadoConstructora
);

router.get('/constructoras/:idConstructora/proyectos', listarProyectos);

router.post(
  '/proyectos',
  [
    body('id_constructora')
      .isInt({ min: 1 })
      .withMessage('La constructora es obligatoria'),
    body('nombre').isString().trim().notEmpty().withMessage('El nombre es obligatorio'),
    validateRequest,
  ],
  crearProyecto
);

router.patch(
  '/proyectos/:idProyecto/estado',
  [
    body('estado')
      .trim()
      .toUpperCase()
      .isIn(['ACTIVO', 'INACTIVO'])
      .withMessage('Estado debe ser ACTIVO o INACTIVO'),
    validateRequest,
  ],
  cambiarEstadoProyecto
);

module.exports = router;
