const db = require("../../config/db");

const toNumOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Adjunto general del acta (item_documentos.archivo_acta). */
const loadArchivosActaByConsecutivo = (consecutivos, callback) => {
  const keys = [
    ...new Set(
      (consecutivos || [])
        .map((c) => String(c ?? "").trim())
        .filter(Boolean)
    ),
  ];

  if (!keys.length) {
    return callback(null, new Map());
  }

  const placeholders = keys.map(() => "?").join(",");
  db.query(
    `SELECT TRIM(numerodoc) AS consecutivo,
            TRIM(valor_campo_doc) AS archivo_acta
       FROM item_documentos
      WHERE tipo_doc = 'ACTAS DE MEDIDA'
        AND nombre_campo_doc = 'archivo_acta'
        AND TRIM(numerodoc) IN (${placeholders})
        AND valor_campo_doc IS NOT NULL
        AND TRIM(valor_campo_doc) <> ''`,
    keys,
    (err, rows) => {
      if (err) return callback(err);
      const map = new Map();
      for (const row of rows || []) {
        const key = String(row.consecutivo ?? "").trim();
        if (key && row.archivo_acta) {
          map.set(key, String(row.archivo_acta).trim());
        }
      }
      return callback(null, map);
    }
  );
};

/**
 * Consulta actas asignadas a un diseñador vía SP_CONSULTAR_ACTAS_DISENADOR.
 * Params: id_disenador (JWT por defecto), estado (null/0 = todos).
 * Devuelve 3 recordsets: dashboard, cabecera, detalle.
 */
const consultActasDisenador = (req, res) => {
  const idFromQuery = toNumOrNull(req.query?.id_disenador);
  const idFromUser = toNumOrNull(req.user?.id_usuario);
  const idDisenador = idFromQuery || idFromUser;

  if (!idDisenador || idDisenador <= 0) {
    return res.status(401).json({
      mensaje: "No se pudo identificar el diseñador.",
    });
  }

  // null o 0 = sin filtro de estado (el SP lo trata igual)
  let estado = toNumOrNull(req.query?.estado);
  if (estado === 0) estado = null;

  db.query(
    "CALL SP_CONSULTAR_ACTAS_DISENADOR(?, ?)",
    [idDisenador, estado],
    (err, results) => {
      if (err) {
        console.error("Error al consultar actas del diseñador:", err);
        return res.status(500).json({
          mensaje: "Error al consultar actas asignadas al diseñador.",
          error: err.message,
        });
      }

      const dashboardRow = Array.isArray(results?.[0]) ? results[0][0] : null;
      const cabecera = Array.isArray(results?.[1]) ? results[1] : [];
      const detalle = Array.isArray(results?.[2]) ? results[2] : [];

      const respond = (cabeceraFinal) =>
        res.status(200).json({
          dashboard: {
            total_asignadas: Number(dashboardRow?.total_asignadas) || 0,
            pendientes: Number(dashboardRow?.pendientes) || 0,
            finalizadas: Number(dashboardRow?.finalizadas) || 0,
            anuladas: Number(dashboardRow?.anuladas) || 0,
          },
          cabecera: cabeceraFinal,
          detalle,
        });

      loadArchivosActaByConsecutivo(
        cabecera.map((h) => h?.consecutivo),
        (loadErr, archivoMap) => {
          if (loadErr) {
            console.error(
              "Error al cargar archivo_acta (actas diseñador):",
              loadErr
            );
            return respond(cabecera);
          }

          return respond(
            cabecera.map((h) => {
              const key = String(h?.consecutivo ?? "").trim();
              return {
                ...h,
                archivo_acta: archivoMap.get(key) || h.archivo_acta || null,
              };
            })
          );
        }
      );
    }
  );
};

module.exports = { consultActasDisenador };
