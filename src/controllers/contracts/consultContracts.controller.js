const db = require('../../config/db');

const consultContractsFull = (req, res) => {
  const {
    buscar = null,
    estado = null,
    fecha_desde = null,
    fecha_hasta = null,
    empresa_asociada = null,
    constructora = null,
    proyecto = null,
  } = req.query;

  const params = [
    buscar && String(buscar).trim() ? String(buscar).trim() : null,
    estado && String(estado).trim() ? String(estado).trim() : null,
    fecha_desde && String(fecha_desde).trim() ? String(fecha_desde).trim() : null,
    fecha_hasta && String(fecha_hasta).trim() ? String(fecha_hasta).trim() : null,
    empresa_asociada && String(empresa_asociada).trim()
      ? String(empresa_asociada).trim()
      : null,
    constructora && String(constructora).trim() ? String(constructora).trim() : null,
    proyecto && String(proyecto).trim() ? String(proyecto).trim() : null,
  ];

  db.query('CALL SP_ConsultarContratosFull(?, ?, ?, ?, ?, ?, ?)', params, (err, results) => {
    if (err) {
      return res.status(500).json({
        error: 'Error al consultar contratos',
        detalle: err,
      });
    }

    const rows = results && results[0] ? results[0] : [];
    return res.status(200).json({ data: rows });
  });
};

const requireAdmin = (req, res) => {
  if (!req.user || Number(req.user.id_perfil) !== 1) {
    res.status(403).json({
      error: 'Solo administradores pueden realizar esta acción sobre contratos.',
    });
    return false;
  }
  return true;
};

const updateContractFull = (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { numerodoc, cabecera, detalle } = req.body || {};

  if (!numerodoc || !String(numerodoc).trim()) {
    return res.status(400).json({ error: 'numerodoc es obligatorio.' });
  }

  const doc = String(numerodoc).trim();
  const cabeceraJson = JSON.stringify(
    cabecera && typeof cabecera === 'object' ? cabecera : {}
  );
  let detalleParam = null;
  if (detalle != null && Array.isArray(detalle) && detalle.length > 0) {
    detalleParam = JSON.stringify(detalle);
  }

  db.query(
    'CALL SP_ActualizarContratoFull(?, ?, ?)',
    [doc, cabeceraJson, detalleParam],
    (err) => {
      if (err) {
        return res.status(500).json({
          error: 'Error al actualizar contrato',
          detalle: err.message || err,
        });
      }
      return res.status(200).json({ mensaje: 'Contrato actualizado correctamente' });
    }
  );
};

const anularContrato = (req, res) => {
  if (!requireAdmin(req, res)) return;

  const numerodoc = String(req.body?.numerodoc ?? '').trim();
  if (!numerodoc) {
    return res.status(400).json({ error: 'numerodoc es obligatorio.' });
  }

  const usuario = Number(req.user?.id_usuario ?? 0);
  if (!Number.isFinite(usuario) || usuario <= 0) {
    return res.status(401).json({
      error: 'No se pudo identificar el usuario de anulación.',
    });
  }

  db.query('CALL SP_ANULAR_CONTRATO(?, ?)', [numerodoc, usuario], (err, results) => {
    if (err) {
      return res.status(500).json({
        error: err.sqlMessage || 'Error al anular el contrato.',
        detalle: err.message || err,
      });
    }
    const row = Array.isArray(results?.[0]) ? results[0][0] : null;
    return res.status(200).json({
      mensaje: row?.mensaje || `Contrato ${numerodoc} anulado correctamente.`,
      resultado: row?.resultado ?? 1,
    });
  });
};

const deleteContrato = (req, res) => {
  if (!requireAdmin(req, res)) return;

  const numerodoc = String(req.body?.numerodoc ?? '').trim();
  if (!numerodoc) {
    return res.status(400).json({ error: 'numerodoc es obligatorio.' });
  }

  db.query('CALL SP_ELIMINAR_CONTRATO_FULL(?)', [numerodoc], (err, results) => {
    if (err) {
      return res.status(500).json({
        error: err.sqlMessage || 'Error al eliminar el contrato.',
        detalle: err.message || err,
      });
    }
    const row = Array.isArray(results?.[0]) ? results[0][0] : null;
    return res.status(200).json({
      mensaje: row?.mensaje || `Contrato ${numerodoc} eliminado correctamente.`,
      resultado: row?.resultado ?? 1,
    });
  });
};

module.exports = {
  consultContractsFull,
  updateContractFull,
  anularContrato,
  deleteContrato,
};
