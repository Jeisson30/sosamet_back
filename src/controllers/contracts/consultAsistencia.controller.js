const db = require('../../config/db');

const norm = (v) => String(v ?? '').trim().toLowerCase();

/**
 * Lista asistencias desde EAV (incluye visitas ABIERTAS sin salida).
 * El SP histórico no siempre trae estado/horas; esta consulta es la fuente de verdad UI.
 */
const listAsistenciasFromEav = (cb) => {
  db.query(
    `SELECT TRIM(numerodoc) AS numerodoc,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'consecutivo' THEN TRIM(valor_campo_doc) END) AS consecutivo,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'fecha' THEN TRIM(valor_campo_doc) END) AS fecha,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'hora_inicio' THEN TRIM(valor_campo_doc) END) AS hora_inicio,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'hora_fin' THEN TRIM(valor_campo_doc) END) AS hora_fin,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'estado_visita' THEN TRIM(valor_campo_doc) END) AS estado_visita,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'trabajador' THEN TRIM(valor_campo_doc) END) AS trabajador,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'cargo' THEN TRIM(valor_campo_doc) END) AS cargo,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'id_trabajador' THEN TRIM(valor_campo_doc) END) AS id_trabajador,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'id_usuario_registro' THEN TRIM(valor_campo_doc) END) AS id_usuario_registro,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'constructora' THEN TRIM(valor_campo_doc) END) AS constructora,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'proyecto' THEN TRIM(valor_campo_doc) END) AS proyecto,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'ubicacion' THEN TRIM(valor_campo_doc) END) AS ubicacion,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'detalle_visita' THEN TRIM(valor_campo_doc) END) AS detalle_visita,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'foto1' THEN TRIM(valor_campo_doc) END) AS foto1,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'foto2' THEN TRIM(valor_campo_doc) END) AS foto2
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'ASISTENCIA'
      GROUP BY numerodoc`,
    (err, rows) => {
      if (err) return cb(err);
      return cb(null, Array.isArray(rows) ? rows : []);
    }
  );
};

const attachIdentificacion = (rows, done) => {
  const ids = [
    ...new Set(
      rows
        .map((r) => Number(r.id_trabajador || r.id_usuario_registro))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ];
  if (!ids.length) {
    return done(
      rows.map((r) => ({
        ...r,
        identificacion: r.identificacion || null,
      }))
    );
  }
  db.query(
    `SELECT id_usuario, identificacion, nombre, apellido
       FROM usuarios
      WHERE id_usuario IN (?)`,
    [ids],
    (err, users) => {
      if (err) {
        return done(rows.map((r) => ({ ...r, identificacion: null })));
      }
      const map = new Map(
        (users || []).map((u) => [Number(u.id_usuario), u])
      );
      return done(
        rows.map((r) => {
          const uid = Number(r.id_trabajador || r.id_usuario_registro);
          const u = map.get(uid);
          return {
            ...r,
            identificacion: u?.identificacion || r.identificacion || null,
            trabajador:
              r.trabajador ||
              (u ? `${u.nombre || ''} ${u.apellido || ''}`.trim() : null),
          };
        })
      );
    }
  );
};

const sortByMostRecent = (rows) => {
  const score = (r) => {
    const raw = String(r.hora_inicio || r.fecha || '').trim();
    if (!raw) return 0;
    const t = Date.parse(raw.replace(' ', 'T'));
    return Number.isFinite(t) ? t : 0;
  };
  return [...rows].sort((a, b) => score(b) - score(a));
};

const applyFilters = (rows, filters) => {
  const {
    buscar,
    fecha_desde,
    fecha_hasta,
    trabajador,
    constructora,
    proyecto,
  } = filters;

  return rows.filter((r) => {
    if (String(r.estado_visita || '').toUpperCase() === 'ELIMINADO') {
      return false;
    }

    if (buscar) {
      const q = norm(buscar);
      const blob = [
        r.numerodoc,
        r.consecutivo,
        r.trabajador,
        r.constructora,
        r.proyecto,
        r.identificacion,
        r.cargo,
      ]
        .map(norm)
        .join(' ');
      if (!blob.includes(q)) return false;
    }

    if (trabajador && norm(r.trabajador) !== norm(trabajador)) {
      return false;
    }
    if (constructora && norm(r.constructora) !== norm(constructora)) {
      return false;
    }
    if (proyecto && norm(r.proyecto) !== norm(proyecto)) {
      return false;
    }

    const day = String(r.fecha || (r.hora_inicio || '').slice(0, 10) || '').trim();
    if (fecha_desde && day && day < fecha_desde) return false;
    if (fecha_hasta && day && day > fecha_hasta) return false;

    return true;
  });
};

const consultAsistencia = (req, res) => {
  const filters = {
    buscar: req.query?.buscar ? String(req.query.buscar).trim() : null,
    fecha_desde: req.query?.fecha_desde
      ? String(req.query.fecha_desde).trim()
      : null,
    fecha_hasta: req.query?.fecha_hasta
      ? String(req.query.fecha_hasta).trim()
      : null,
    trabajador: req.query?.trabajador
      ? String(req.query.trabajador).trim()
      : null,
    constructora: req.query?.constructora
      ? String(req.query.constructora).trim()
      : null,
    proyecto: req.query?.proyecto ? String(req.query.proyecto).trim() : null,
  };

  listAsistenciasFromEav((err, rows) => {
    if (err) {
      return res.status(500).json({
        error: 'Error al consultar asistencias',
        detalle: err,
      });
    }

    attachIdentificacion(rows, (withId) => {
      const filtered = applyFilters(withId, filters);
      const sorted = sortByMostRecent(filtered).map((r) => {
        const estado = String(r.estado_visita || '').toUpperCase();
        const abierta =
          estado === 'ABIERTA' || (!r.hora_fin && estado !== 'CERRADA' && estado !== 'ANULADA');
        return {
          ...r,
          consecutivo: r.consecutivo || r.numerodoc,
          estado_visita: estado || (abierta ? 'ABIERTA' : null),
          sin_salida: abierta && !r.hora_fin,
        };
      });
      return res.status(200).json({ data: sorted });
    });
  });
};

const upsertCampo = (numerodoc, nombre, valor, cb) => {
  const doc = String(numerodoc).trim();
  const field = String(nombre).trim();
  const v = String(valor ?? '');
  db.query(
    `UPDATE item_documentos
        SET valor_campo_doc = ?
      WHERE UPPER(TRIM(tipo_doc)) = 'ASISTENCIA'
        AND TRIM(numerodoc) = ?
        AND TRIM(nombre_campo_doc) = ?`,
    [v, doc, field],
    (err, result) => {
      if (err) return cb(err);
      if (result && Number(result.affectedRows) > 0) return cb(null);
      db.query(
        `INSERT INTO item_documentos
           (tipo_doc, numerodoc, nombre_campo_doc, valor_campo_doc)
         VALUES ('ASISTENCIA', ?, ?, ?)`,
        [doc, field, v],
        cb
      );
    }
  );
};

const updateAsistencia = (req, res) => {
  if (!req.user || Number(req.user.id_perfil) !== 1) {
    return res.status(403).json({
      error: 'Solo administradores pueden actualizar asistencias.',
    });
  }

  const { numerodoc, campos } = req.body || {};

  if (!numerodoc || !String(numerodoc).trim()) {
    return res.status(400).json({ error: 'numerodoc es obligatorio.' });
  }

  if (!Array.isArray(campos) || campos.length === 0) {
    return res.status(400).json({ error: 'campos debe ser un arreglo no vacío.' });
  }

  const doc = String(numerodoc).trim();
  let i = 0;
  const next = () => {
    if (i >= campos.length) {
      return res.status(200).json({ mensaje: 'Asistencia actualizada correctamente' });
    }
    const c = campos[i++];
    const nombre = String(c?.nombre || '').trim();
    if (!nombre) return next();
    upsertCampo(doc, nombre, c?.valor, (err) => {
      if (err) {
        return res.status(500).json({
          error: 'Error al actualizar asistencia',
          detalle: err,
        });
      }
      next();
    });
  };
  next();
};

const anularAsistencia = (req, res) => {
  if (!req.user || Number(req.user.id_perfil) !== 1) {
    return res.status(403).json({
      error: 'Solo administradores pueden anular asistencias.',
    });
  }
  const numerodoc = String(req.body?.numerodoc || '').trim();
  if (!numerodoc) {
    return res.status(400).json({ error: 'numerodoc es obligatorio.' });
  }
  upsertCampo(numerodoc, 'estado_visita', 'ANULADA', (err) => {
    if (err) {
      return res.status(500).json({
        error: 'Error al anular la asistencia',
        detalle: err,
      });
    }
    return res.status(200).json({ mensaje: 'Asistencia anulada correctamente' });
  });
};

const deleteAsistencia = (req, res) => {
  if (!req.user || Number(req.user.id_perfil) !== 1) {
    return res.status(403).json({
      error: 'Solo administradores pueden eliminar asistencias.',
    });
  }
  const numerodoc = String(req.body?.numerodoc || '').trim();
  if (!numerodoc) {
    return res.status(400).json({ error: 'numerodoc es obligatorio.' });
  }
  db.query(
    `DELETE FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'ASISTENCIA'
        AND TRIM(numerodoc) = ?`,
    [numerodoc],
    (err) => {
      if (err) {
        return res.status(500).json({
          error: 'Error al eliminar la asistencia',
          detalle: err,
        });
      }
      return res.status(200).json({ mensaje: 'Asistencia eliminada correctamente' });
    }
  );
};

module.exports = {
  consultAsistencia,
  updateAsistencia,
  anularAsistencia,
  deleteAsistencia,
};
