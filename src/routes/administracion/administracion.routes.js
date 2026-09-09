const express = require('express');
const { body, query } = require('express-validator');
const { validateRequest } = require('../../middlewares/validation.middleware');
const {
  crearConstructora,
  listarConstructoras,
  cambiarEstadoConstructora,
  crearProyecto,
  listarProyectos,
  cambiarEstadoProyecto,
} = require('../../controllers/administracion/administracion.controller');
const {
  listarCotizacionesPendientes,
  amarrarContrato,
} = require('../../controllers/administracion/amarrarContrato.controller');
const {
  crearDocumentoNumero,
  listarDocumentosNumero,
  cambiarEstadoDocumentoNumero,
  actualizarDocumentoNumero,
  eliminarDocumentoNumero,
} = require('../../controllers/administracion/documentoNumero.controller');
const {
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  cambiarEstadoCategoria,
  listarInsumos,
  crearInsumo,
  actualizarInsumo,
  cambiarEstadoInsumo,
  siguienteCodigo,
} = require('../../controllers/administracion/insumos.controller');

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

router.get(
  '/cotizaciones-pendientes',
  [
    query('tipo_doc')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('tipo_doc es obligatorio'),
    validateRequest,
  ],
  listarCotizacionesPendientes
);

router.post(
  '/amarrar-contrato',
  [
    body('numero_contrato')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('numero_contrato es obligatorio'),
    body('tipo_doc')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('tipo_doc es obligatorio'),
    body('numero_cotizacion')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('numero_cotizacion es obligatorio'),
    validateRequest,
  ],
  amarrarContrato
);

router.get('/documentos-numero', listarDocumentosNumero);

router.post(
  '/documentos-numero',
  [
    body('id_constructora')
      .isInt({ min: 1 })
      .withMessage('id_constructora es obligatorio'),
    body('id_proyecto')
      .isInt({ min: 1 })
      .withMessage('id_proyecto es obligatorio'),
    body('tipo_doc')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('tipo_doc es obligatorio'),
    body('numero_documento')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('numero_documento es obligatorio'),
    validateRequest,
  ],
  crearDocumentoNumero
);

router.patch(
  '/documentos-numero/:idDocumentoNumero/estado',
  [
    body('estado')
      .trim()
      .toUpperCase()
      .isIn(['ACTIVO', 'INACTIVO'])
      .withMessage('Estado debe ser ACTIVO o INACTIVO'),
    validateRequest,
  ],
  cambiarEstadoDocumentoNumero
);

router.put(
  '/documentos-numero/:idDocumentoNumero',
  [
    body('id_constructora')
      .isInt({ min: 1 })
      .withMessage('id_constructora es obligatorio'),
    body('id_proyecto')
      .isInt({ min: 1 })
      .withMessage('id_proyecto es obligatorio'),
    body('tipo_doc')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('tipo_doc es obligatorio'),
    body('numero_documento')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('numero_documento es obligatorio'),
    body('estado')
      .optional({ nullable: true })
      .trim()
      .toUpperCase()
      .isIn(['ACTIVO', 'INACTIVO'])
      .withMessage('Estado debe ser ACTIVO o INACTIVO'),
    validateRequest,
  ],
  actualizarDocumentoNumero
);

router.delete(
  '/documentos-numero/:idDocumentoNumero',
  eliminarDocumentoNumero
);

/* ---------- Insumos (catálogo parametrizable) ---------- */
router.get('/insumos/categorias', listarCategorias);
router.post(
  '/insumos/categorias',
  [
    body('nombre').isString().trim().notEmpty().withMessage('El nombre es obligatorio'),
    body('prefijo').isString().trim().notEmpty().withMessage('El prefijo es obligatorio'),
    validateRequest,
  ],
  crearCategoria
);
router.put(
  '/insumos/categorias/:idCategoria',
  [
    body('nombre').isString().trim().notEmpty().withMessage('El nombre es obligatorio'),
    validateRequest,
  ],
  actualizarCategoria
);
router.patch(
  '/insumos/categorias/:idCategoria/estado',
  [
    body('estado')
      .trim()
      .toUpperCase()
      .isIn(['ACTIVO', 'INACTIVO'])
      .withMessage('Estado debe ser ACTIVO o INACTIVO'),
    validateRequest,
  ],
  cambiarEstadoCategoria
);

router.get('/insumos', listarInsumos);
router.get('/insumos/siguiente-codigo', siguienteCodigo);
router.post(
  '/insumos',
  [
    body('id_categoria').isInt({ min: 1 }).withMessage('La categoría es obligatoria'),
    body('nombre').isString().trim().notEmpty().withMessage('El nombre es obligatorio'),
    body('codigo').optional({ nullable: true }).isString().trim(),
    validateRequest,
  ],
  crearInsumo
);
router.put(
  '/insumos/:idInsumo',
  [
    body('nombre').isString().trim().notEmpty().withMessage('El nombre es obligatorio'),
    body('codigo').isString().trim().notEmpty().withMessage('El código es obligatorio'),
    validateRequest,
  ],
  actualizarInsumo
);
router.patch(
  '/insumos/:idInsumo/estado',
  [
    body('estado')
      .trim()
      .toUpperCase()
      .isIn(['ACTIVO', 'INACTIVO'])
      .withMessage('Estado debe ser ACTIVO o INACTIVO'),
    validateRequest,
  ],
  cambiarEstadoInsumo
);

module.exports = router;
