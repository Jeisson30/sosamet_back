const db = require('../../config/db');
const { toPublicUploadPath } = require('../../config/uploadsPath');

const dbp = db.promise();
const TIPO = 'ASISTENCIA';
const AS_PREFIX = 'AS';
const AS_FLOOR = 1;

/** Fecha-hora America/Bogota como `YYYY-MM-DD HH:mm:ss`. */
function nowBogota() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' });
}

function datePartBogota(dt = nowBogota()) {
  return String(dt).slice(0, 10);
}

/**
 * Insert directo en EAV (no usa SP: el SP solo inserta campos de parametros_documentos).
 */
async function insertCampo(numerodoc, nombre, valor) {
  const doc = String(numerodoc || '').trim();
  const field = String(nombre || '').trim();
  const v = String(valor ?? '');
  if (!doc || !field) return;

  const [existing] = await dbp.query(
    `SELECT 1
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = ?
        AND TRIM(numerodoc) = ?
        AND TRIM(nombre_campo_doc) = ?
      LIMIT 1`,
    [TIPO, doc, field]
  );
  if (Array.isArray(existing) && existing.length) {
    await dbp.query(
      `UPDATE item_documentos
          SET valor_campo_doc = ?
        WHERE UPPER(TRIM(tipo_doc)) = ?
          AND TRIM(numerodoc) = ?
          AND TRIM(nombre_campo_doc) = ?`,
      [v, TIPO, doc, field]
    );
    return;
  }

  await dbp.query(
    `INSERT INTO item_documentos
       (tipo_doc, numerodoc, nombre_campo_doc, valor_campo_doc)
     VALUES (?, ?, ?, ?)`,
    [TIPO, doc, field, v]
  );
}

async function upsertCampo(numerodoc, nombre, valor) {
  await insertCampo(numerodoc, nombre, valor);
}

async function peekNextAsConsecutivo() {
  const [rows] = await dbp.query(
    `SELECT TRIM(numerodoc) AS numerodoc,
            MAX(CASE WHEN nombre_campo_doc = 'consecutivo'
                     THEN TRIM(valor_campo_doc) END) AS consecutivo
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = ?
      GROUP BY numerodoc`,
    [TIPO]
  );
  let maxNum = 0;
  const re = new RegExp(`^${AS_PREFIX}-(\\d+)$`, 'i');
  for (const r of rows || []) {
    const cand = String(r.consecutivo || r.numerodoc || '').trim();
    const m = cand.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  const next = Math.max(maxNum, AS_FLOOR - 1) + 1;
  const consecutivo = `${AS_PREFIX}-${String(next).padStart(3, '0')}`;
  return { consecutivo, numero: next };
}

async function consecutivoExists(consecutivo) {
  const doc = String(consecutivo || '').trim();
  if (!doc) return false;
  const [rows] = await dbp.query(
    `SELECT numerodoc
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = ?
        AND TRIM(numerodoc) = ?
      LIMIT 1`,
    [TIPO, doc]
  );
  return Array.isArray(rows) && rows.length > 0;
}

function mapVisitRow(r) {
  if (!r) return null;
  return {
    numerodoc: String(r.numerodoc || '').trim(),
    consecutivo: r.consecutivo || r.numerodoc || null,
    estado_visita: r.estado_visita || null,
    id_usuario_registro: r.id_usuario_registro || null,
    hora_inicio: r.hora_inicio || null,
    hora_fin: r.hora_fin || null,
    trabajador: r.trabajador || null,
    cargo: r.cargo || null,
    id_trabajador: r.id_trabajador || null,
    constructora: r.constructora || null,
    proyecto: r.proyecto || null,
    ubicacion: r.ubicacion || null,
    detalle_visita: r.detalle_visita || null,
    foto1: r.foto1 || null,
    fecha: r.fecha || null,
  };
}

async function loadVisitPivot(whereSql, params) {
  const [rows] = await dbp.query(
    `SELECT TRIM(numerodoc) AS numerodoc,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'estado_visita' THEN TRIM(valor_campo_doc) END) AS estado_visita,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'id_usuario_registro' THEN TRIM(valor_campo_doc) END) AS id_usuario_registro,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'consecutivo' THEN TRIM(valor_campo_doc) END) AS consecutivo,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'hora_inicio' THEN TRIM(valor_campo_doc) END) AS hora_inicio,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'hora_fin' THEN TRIM(valor_campo_doc) END) AS hora_fin,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'trabajador' THEN TRIM(valor_campo_doc) END) AS trabajador,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'cargo' THEN TRIM(valor_campo_doc) END) AS cargo,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'id_trabajador' THEN TRIM(valor_campo_doc) END) AS id_trabajador,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'constructora' THEN TRIM(valor_campo_doc) END) AS constructora,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'proyecto' THEN TRIM(valor_campo_doc) END) AS proyecto,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'ubicacion' THEN TRIM(valor_campo_doc) END) AS ubicacion,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'detalle_visita' THEN TRIM(valor_campo_doc) END) AS detalle_visita,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'foto1' THEN TRIM(valor_campo_doc) END) AS foto1,
            MAX(CASE WHEN TRIM(nombre_campo_doc) = 'fecha' THEN TRIM(valor_campo_doc) END) AS fecha
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = ?
        ${whereSql}
      GROUP BY numerodoc`,
    [TIPO, ...params]
  );
  return Array.isArray(rows) ? rows.map(mapVisitRow) : [];
}

async function findOpenVisitByUser(idUsuario) {
  const uid = String(idUsuario ?? '').trim();
  if (!uid) return null;

  const rows = await loadVisitPivot('', []);
  const open = rows.find(
    (r) =>
      String(r.estado_visita || '').toUpperCase() === 'ABIERTA' &&
      String(r.id_usuario_registro || '').trim() === uid
  );
  return open || null;
}

async function findVisitByNumerodoc(numerodoc) {
  const doc = String(numerodoc || '').trim();
  if (!doc) return null;
  const rows = await loadVisitPivot('AND TRIM(numerodoc) = ?', [doc]);
  return rows[0] || null;
}

const getOpenVisit = async (req, res) => {
  try {
    const idUsuario = req.user?.id_usuario;
    if (!idUsuario) {
      return res.status(401).json({ code: 0, message: 'Usuario no autenticado.' });
    }
    const open = await findOpenVisitByUser(idUsuario);
    return res.status(200).json({
      code: 1,
      open: !!open,
      visita: open || null,
    });
  } catch (err) {
    console.error('getOpenVisit:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al consultar visita abierta.',
      error: err.message,
    });
  }
};

const startVisit = async (req, res) => {
  try {
    const idUsuario = req.user?.id_usuario;
    if (!idUsuario) {
      return res.status(401).json({ code: 0, message: 'Usuario no autenticado.' });
    }

    const existing = await findOpenVisitByUser(idUsuario);
    if (existing) {
      return res.status(409).json({
        code: 0,
        message:
          'Ya tiene una visita abierta. Debe finalizarla antes de iniciar otra.',
        visita: existing,
      });
    }

    let consecutivo = String(req.body?.consecutivo || '').trim();
    if (!consecutivo) {
      consecutivo = (await peekNextAsConsecutivo()).consecutivo;
    }
    if (await consecutivoExists(consecutivo)) {
      consecutivo = (await peekNextAsConsecutivo()).consecutivo;
      if (await consecutivoExists(consecutivo)) {
        return res.status(409).json({
          code: 0,
          message: `El consecutivo ${consecutivo} ya existe. Intente de nuevo.`,
        });
      }
    }

    const horaInicio = nowBogota();
    const fecha = datePartBogota(horaInicio);
    const trabajador = String(req.body?.trabajador || '').trim();
    const cargo = String(req.body?.cargo || '').trim();
    const idTrabajador = String(
      req.body?.id_trabajador || idUsuario || ''
    ).trim();

    const campos = [
      ['consecutivo', consecutivo],
      ['estado_visita', 'ABIERTA'],
      ['hora_inicio', horaInicio],
      ['fecha', fecha],
      ['id_usuario_registro', String(idUsuario)],
      ['id_trabajador', idTrabajador],
      ['trabajador', trabajador],
      ['cargo', cargo],
    ];

    for (const [nombre, valor] of campos) {
      await insertCampo(consecutivo, nombre, valor);
    }

    return res.status(201).json({
      code: 1,
      message: 'Visita iniciada.',
      visita: {
        numerodoc: consecutivo,
        consecutivo,
        estado_visita: 'ABIERTA',
        hora_inicio: horaInicio,
        fecha,
        trabajador,
        cargo,
        id_trabajador: idTrabajador,
        id_usuario_registro: String(idUsuario),
      },
    });
  } catch (err) {
    console.error('startVisit:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al iniciar la visita.',
      error: err.message,
    });
  }
};

const finishVisit = async (req, res) => {
  try {
    const idUsuario = req.user?.id_usuario;
    if (!idUsuario) {
      return res.status(401).json({ code: 0, message: 'Usuario no autenticado.' });
    }

    const numerodoc = String(
      req.body?.numerodoc || req.body?.consecutivo || ''
    ).trim();
    if (!numerodoc) {
      return res.status(400).json({
        code: 0,
        message: 'numerodoc / consecutivo es obligatorio.',
      });
    }

    let open = await findVisitByNumerodoc(numerodoc);

    // Visitas iniciadas antes del fix (solo consecutivo/fecha): reclamar y abrir.
    if (open && !open.estado_visita) {
      await insertCampo(numerodoc, 'estado_visita', 'ABIERTA');
      await insertCampo(numerodoc, 'id_usuario_registro', String(idUsuario));
      if (!open.hora_inicio) {
        await insertCampo(numerodoc, 'hora_inicio', nowBogota());
      }
      open = await findVisitByNumerodoc(numerodoc);
    }

    if (!open) {
      return res.status(404).json({
        code: 0,
        message: 'No se encontró el documento de asistencia.',
      });
    }

    const estado = String(open.estado_visita || '').toUpperCase();
    if (estado === 'CERRADA') {
      return res.status(400).json({
        code: 0,
        message: 'Esta visita ya está cerrada.',
      });
    }

    const owner = String(open.id_usuario_registro || '').trim();
    if (owner && owner !== String(idUsuario).trim()) {
      return res.status(403).json({
        code: 0,
        message: 'Esta visita abierta pertenece a otro usuario.',
      });
    }

    // Si no tenía dueño (dato viejo), asignarlo al que cierra.
    if (!owner) {
      await insertCampo(numerodoc, 'id_usuario_registro', String(idUsuario));
      await insertCampo(numerodoc, 'estado_visita', 'ABIERTA');
    }

    let consecutivoFinal = String(
      req.body?.consecutivo || open.consecutivo || numerodoc
    ).trim();

    if (consecutivoFinal !== numerodoc) {
      if (await consecutivoExists(consecutivoFinal)) {
        return res.status(409).json({
          code: 0,
          message: `Ya existe un documento con el consecutivo ${consecutivoFinal}.`,
        });
      }
    }

    const horaFin = nowBogota();
    const fotoRel = req.file
      ? toPublicUploadPath(req.file.filename)
      : String(req.body?.foto1 || open.foto1 || '').trim();

    const updates = [
      ['consecutivo', consecutivoFinal],
      ['constructora', req.body?.constructora],
      ['proyecto', req.body?.proyecto],
      ['ubicacion', req.body?.ubicacion],
      ['detalle_visita', req.body?.detalle_visita],
      ['trabajador', req.body?.trabajador || open.trabajador],
      ['cargo', req.body?.cargo || open.cargo],
      ['id_trabajador', req.body?.id_trabajador || open.id_trabajador],
      ['foto1', fotoRel],
      ['hora_fin', horaFin],
      ['estado_visita', 'CERRADA'],
      ['id_usuario_registro', String(idUsuario)],
    ];

    for (const [nombre, valor] of updates) {
      if (valor === undefined || valor === null) continue;
      await upsertCampo(numerodoc, nombre, valor);
    }

    return res.status(200).json({
      code: 1,
      message: 'Visita finalizada correctamente.',
      visita: {
        numerodoc,
        consecutivo: consecutivoFinal,
        estado_visita: 'CERRADA',
        hora_inicio: open.hora_inicio,
        hora_fin: horaFin,
        foto1: fotoRel,
      },
    });
  } catch (err) {
    console.error('finishVisit:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al finalizar la visita.',
      error: err.message,
    });
  }
};

module.exports = {
  getOpenVisit,
  startVisit,
  finishVisit,
  peekNextAsConsecutivo,
  nowBogota,
};
