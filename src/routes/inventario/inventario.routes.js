const express = require('express');
const router = express.Router();
const uploadInventario = require('../../middlewares/uploadInventario.middleware');
const {
  registrarMovimiento,
  siguienteConsecutivo,
  listarParametros,
  subirAdjuntos,
  listarAdjuntos,
  listarMovimientos,
  anularMovimiento,
  listarExistencias,
  editarItem,
  anularItem,
  eliminarItem,
  historialItem,
} = require('../../controllers/inventario/inventario.controller');
const {
  listarEntregasPorDevolver,
  detalleEntregaDevolucion,
  registrarDevolucion,
} = require('../../controllers/inventario/devolucion.controller');
const { listarEntregas, detalleEntrega, editarEntrega } = require('../../controllers/inventario/entregaConsulta.controller');

const recibirFotos = (req, res, next) => {
  uploadInventario.array('fotos', 10)(req, res, (err) => {
    if (err) {
      const mensaje =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Cada foto puede pesar máximo 10 MB.'
          : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Máximo 10 fotos por entrega.'
            : err.message || 'No se pudieron recibir las fotos.';
      return res.status(400).json({ codigo: 0, mensaje });
    }
    next();
  });
};

router.get('/siguiente-consecutivo', siguienteConsecutivo);
router.get('/parametros', listarParametros);
router.post('/movimientos', registrarMovimiento);
router.get('/movimientos', listarMovimientos);
router.patch('/movimientos/:idMovimiento/anular', anularMovimiento);
router.post('/movimientos/:idMovimiento/adjuntos', recibirFotos, subirAdjuntos);
router.get('/movimientos/:idMovimiento/adjuntos', listarAdjuntos);
router.put('/items/:idDetalle', editarItem);
router.patch('/items/:idDetalle/anular', anularItem);
router.delete('/items/:idDetalle', eliminarItem);
router.get('/items/:idDetalle/historial', historialItem);
router.get('/existencias', listarExistencias);
router.get('/devoluciones/entregas', listarEntregasPorDevolver);
router.get('/devoluciones/entregas/:idMovimiento', detalleEntregaDevolucion);
router.post('/devoluciones', registrarDevolucion);
router.get('/entregas', listarEntregas);
router.get('/entregas/:idMovimiento', detalleEntrega);
router.put('/entregas/:idMovimiento', editarEntrega);

module.exports = router;
