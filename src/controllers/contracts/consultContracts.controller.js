const db = require('../../config/db');
const {
  aplicarRestriccionValores,
  puedeEditarContrato,
} = require('../../utils/permissions');

/** Claves del payload front → nombre real en item_documentos (consulta/creación). */
const CABECERA_KEY_ALIASES = {
  valor_anticipo: 'Valor anticipo',
};

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
    return res.status(200).json(
      aplicarRestriccionValores(req.user, { data: rows })
    );
  });
};

const requireAdmin = (req, res) => {
  if (!req.user || Number(req.user.id_perfil) !== 1) {
    res.status(403).json({
      error: 'Solo administradores pueden anular o eliminar contratos.',
    });
    return false;
  }
  return true;
};

const requireEditorContrato = (req, res) => {
  if (!puedeEditarContrato(req.user)) {
    res.status(403).json({
      error: 'No tiene permiso para editar contratos.',
    });
    return false;
  }
  return true;
};

const normalizeCabecera = (cabecera) => {
  const src =
    cabecera && typeof cabecera === 'object' && !Array.isArray(cabecera)
      ? cabecera
      : {};
  const out = {};
  for (const [rawKey, rawVal] of Object.entries(src)) {
    const key = CABECERA_KEY_ALIASES[rawKey] || rawKey;
    if (!key) continue;
    if (rawVal == null || String(rawVal).trim() === '' || String(rawVal) === 'null') {
      out[key] = null;
    } else {
      out[key] = String(rawVal).trim();
    }
  }
  // No dejar huérfano valor_anticipo si también llega Valor anticipo.
  if (Object.prototype.hasOwnProperty.call(out, 'Valor anticipo')) {
    delete out.valor_anticipo;
  }
  return out;
};

/**
 * Upsert EAV por campo (misma lógica que remisiones): el SP hace UPDATE/INSERT,
 * pero reforzamos aquí por si el SP en prod aún no tiene JSON_QUOTE / TRIM.
 */
const upsertContratoCampo = (numerodoc, nombreCampo, valor, done) => {
  const doc = String(numerodoc || '').trim();
  const campo = String(nombreCampo || '').trim();
  if (!doc || !campo) {
    return done(null);
  }
  const v = valor == null ? null : String(valor);

  db.query(
    `SELECT tipo_doc
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
        AND TRIM(numerodoc) = ?
      LIMIT 1`,
    [doc],
    (errTipo, tipoRows) => {
      if (errTipo) return done(errTipo);
      const tipoDoc =
        Array.isArray(tipoRows) && tipoRows[0]?.tipo_doc
          ? String(tipoRows[0].tipo_doc).trim()
          : 'Contrato';

      db.query(
        `SELECT 1 AS ok
           FROM item_documentos
          WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
            AND TRIM(numerodoc) = ?
            AND TRIM(nombre_campo_doc) = ?
          LIMIT 1`,
        [doc, campo],
        (err, rows) => {
          if (err) return done(err);
          if (Array.isArray(rows) && rows.length > 0) {
            return db.query(
              `UPDATE item_documentos
                  SET valor_campo_doc = ?
                WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
                  AND TRIM(numerodoc) = ?
                  AND TRIM(nombre_campo_doc) = ?`,
              [v, doc, campo],
              (errUp) => done(errUp || null)
            );
          }
          return db.query(
            `INSERT INTO item_documentos
               (tipo_doc, numerodoc, nombre_campo_doc, valor_campo_doc)
             VALUES (?, ?, ?, ?)`,
            [tipoDoc, doc, campo, v],
            (errIns) => done(errIns || null)
          );
        }
      );
    }
  );
};

const upsertCabeceraEav = (numerodoc, cabecera, done) => {
  const entries = Object.entries(cabecera || {});
  if (!entries.length) return done(null);

  let i = 0;
  const next = (err) => {
    if (err) return done(err);
    if (i >= entries.length) return done(null);
    const [campo, valor] = entries[i++];
    upsertContratoCampo(numerodoc, campo, valor, next);
  };
  next(null);
};

const updateContractFull = (req, res) => {
  if (!requireEditorContrato(req, res)) return;

  const { numerodoc, cabecera, detalle } = req.body || {};

  if (!numerodoc || !String(numerodoc).trim()) {
    return res.status(400).json({ error: 'numerodoc es obligatorio.' });
  }

  const doc = String(numerodoc).trim();
  const cab = normalizeCabecera(cabecera);
  const cabeceraJson = JSON.stringify(cab);
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

      // Refuerzo EAV (encargado, Valor anticipo, etc.) aunque el SP legado falle en algún campo.
      upsertCabeceraEav(doc, cab, (eavErr) => {
        if (eavErr) {
          return res.status(500).json({
            error:
              'El contrato se actualizó parcialmente; no se pudieron guardar todos los campos de cabecera.',
            detalle: eavErr.message || eavErr,
          });
        }
        return res
          .status(200)
          .json({ mensaje: 'Contrato actualizado correctamente' });
      });
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
