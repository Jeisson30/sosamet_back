const db = require("../../config/db");

const toNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s : null;
  }
  return v;
};

const toNumOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Adjunto general del acta (Adjuntar Acta) en item_documentos.archivo_acta. */
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
 * Consulta actas de medida vía SP_CONSULTAR_ACTAS_MEDIDA(6 params).
 * Params: buscar, constructora, proyecto, contrato, fecha_desde, fecha_hasta
 * (null = sin filtro / trae todo).
 * Devuelve 2 recordsets: cabecera y detalle.
 * Enriquecer cabecera con archivo_acta (adjunto general, no por ítem).
 */
const consultActasMedida = (req, res) => {
  const {
    buscar = null,
    constructora = null,
    proyecto = null,
    contrato = null,
    fecha_desde = null,
    fecha_hasta = null,
  } = req.query;

  const params = [
    toNull(buscar),
    toNull(constructora),
    toNull(proyecto),
    toNull(contrato),
    toNull(fecha_desde),
    toNull(fecha_hasta),
  ];

  db.query(
    "CALL SP_CONSULTAR_ACTAS_MEDIDA(?, ?, ?, ?, ?, ?)",
    params,
    (err, results) => {
      if (err) {
        console.error("Error al consultar actas de medida:", err);
        return res.status(500).json({
          mensaje: "Error al consultar actas de medida.",
          error: err.message,
        });
      }

      const cabecera = Array.isArray(results?.[0]) ? results[0] : [];
      const detalle = Array.isArray(results?.[1]) ? results[1] : [];

      loadArchivosActaByConsecutivo(
        cabecera.map((h) => h?.consecutivo),
        (loadErr, archivoMap) => {
          if (loadErr) {
            console.error(
              "Error al cargar archivo_acta de actas de medida:",
              loadErr
            );
            return res.status(200).json({ cabecera, detalle });
          }

          const cabeceraEnriquecida = cabecera.map((h) => {
            const key = String(h?.consecutivo ?? "").trim();
            return {
              ...h,
              archivo_acta: archivoMap.get(key) || h.archivo_acta || null,
            };
          });

          return res.status(200).json({
            cabecera: cabeceraEnriquecida,
            detalle,
          });
        }
      );
    }
  );
};

/**
 * Actualiza acta de medida vía SP_ACTUALIZAR_ACTA_MEDIDA.
 * p_usuario_modificacion = id del usuario autenticado (JWT).
 */
const updateActasMedida = (req, res) => {
  const body = req.body || {};
  const consecutivo = String(body.consecutivo ?? "").trim();

  if (!consecutivo) {
    return res.status(400).json({
      mensaje: "El consecutivo es obligatorio.",
    });
  }

  const usuarioModificacion = Number(
    req.user?.id_usuario ?? body.usuario_modificacion ?? 0
  );

  if (!Number.isFinite(usuarioModificacion) || usuarioModificacion <= 0) {
    return res.status(401).json({
      mensaje: "No se pudo identificar el usuario de modificación.",
    });
  }

  const params = [
    consecutivo,
    body.actualizar_cabecera ? 1 : 0,
    body.actualizar_detalle ? 1 : 0,
    toNull(body.constructora),
    toNull(body.proyecto),
    toNull(body.numero_contrato),
    toNull(body.fecha_acta),
    toNull(body.fecha_terminacion),
    toNull(body.observaciones),
    toNull(body.tipo_documento),
    toNull(body.descripcion_general),
    toNumOrNull(body.id_disenador),
    toNumOrNull(body.amd_id),
    toNull(body.item),
    toNull(body.detalle),
    toNumOrNull(body.cantidad),
    toNull(body.unidad_medida),
    toNumOrNull(body.ancho),
    toNumOrNull(body.alto),
    toNull(body.observaciones_detalle),
    toNull(body.evidencia),
    usuarioModificacion,
  ];

  db.query(
    "CALL SP_ACTUALIZAR_ACTA_MEDIDA(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    params,
    (err, results) => {
      if (err) {
        console.error("Error al actualizar acta de medida:", err);
        return res.status(500).json({
          mensaje: "Error al actualizar el acta de medida.",
          error: err.message,
        });
      }

      const finish = () => {
        const row = Array.isArray(results?.[0]) ? results[0][0] : null;
        return res.status(200).json({
          mensaje: row?.mensaje || "Acta de medida actualizada correctamente.",
          resultado: row?.resultado ?? 1,
        });
      };

      // Campos de plano (opcionales) — no están en el SP de actualización
      const amdId = toNumOrNull(body.amd_id);
      const hasPlanoFields =
        body.actualizar_detalle &&
        amdId &&
        (body.consecutivo_item !== undefined ||
          body.evidencia_item !== undefined ||
          body.fecha_enviado !== undefined ||
          body.fecha_aprobado !== undefined);

      if (!hasPlanoFields) {
        return finish();
      }

      db.query(
        `UPDATE actas_medida_detalle
            SET amd_consecutivo_item = COALESCE(?, amd_consecutivo_item),
                amd_evidencia_item = COALESCE(?, amd_evidencia_item),
                amd_fecha_enviado = COALESCE(?, amd_fecha_enviado),
                amd_fecha_aprobado = COALESCE(?, amd_fecha_aprobado),
                amd_fecha_modificacion = NOW(),
                amd_usuario_modificacion = ?
          WHERE amd_id = ?`,
        [
          toNull(body.consecutivo_item),
          toNull(body.evidencia_item),
          toNull(body.fecha_enviado),
          toNull(body.fecha_aprobado),
          usuarioModificacion,
          amdId,
        ],
        (updErr) => {
          if (updErr) {
            console.error("Error al actualizar campos de plano:", updErr);
            return res.status(500).json({
              mensaje:
                "Acta actualizada, pero falló la actualización de campos de plano.",
              error: updErr.message,
            });
          }
          return finish();
        }
      );
    }
  );
};

/**
 * Elimina acta de medida vía SP_ELIMINAR_ACTA_MEDIDA(consecutivo).
 */
const deleteActasMedida = (req, res) => {
  const consecutivo = String(
    req.body?.consecutivo ?? req.params?.consecutivo ?? ""
  ).trim();

  if (!consecutivo) {
    return res.status(400).json({
      mensaje: "El consecutivo es obligatorio.",
    });
  }

  db.query(
    "CALL SP_ELIMINAR_ACTA_MEDIDA(?)",
    [consecutivo],
    (err, results) => {
      if (err) {
        console.error("Error al eliminar acta de medida:", err);
        const sqlMessage = err.sqlMessage || err.message || "";
        return res.status(500).json({
          mensaje: sqlMessage || "Error al eliminar el acta de medida.",
          error: err.message,
        });
      }

      const row = Array.isArray(results?.[0]) ? results[0][0] : null;
      return res.status(200).json({
        mensaje:
          row?.mensaje ||
          `El Acta de Medida ${consecutivo} fue eliminada correctamente.`,
        resultado: row?.resultado ?? 1,
      });
    }
  );
};

/**
 * Anula acta de medida vía SP_ANULAR_ACTA_MEDIDA(consecutivo, usuario).
 * pUsuario = id del usuario autenticado (JWT).
 */
const anularActasMedida = (req, res) => {
  const body = req.body || {};
  const consecutivo = String(body.consecutivo ?? "").trim();

  if (!consecutivo) {
    return res.status(400).json({
      mensaje: "El consecutivo es obligatorio.",
    });
  }

  const usuario = Number(req.user?.id_usuario ?? body.usuario ?? 0);

  if (!Number.isFinite(usuario) || usuario <= 0) {
    return res.status(401).json({
      mensaje: "No se pudo identificar el usuario de anulación.",
    });
  }

  db.query(
    "CALL SP_ANULAR_ACTA_MEDIDA(?, ?)",
    [consecutivo, usuario],
    (err, results) => {
      if (err) {
        console.error("Error al anular acta de medida:", err);
        const sqlMessage = err.sqlMessage || err.message || "";
        return res.status(500).json({
          mensaje: sqlMessage || "Error al anular el acta de medida.",
          error: err.message,
        });
      }

      const row = Array.isArray(results?.[0]) ? results[0][0] : null;
      return res.status(200).json({
        mensaje:
          row?.mensaje || `Acta ${consecutivo} anulada correctamente.`,
        resultado: row?.resultado ?? 1,
      });
    }
  );
};

module.exports = {
  consultActasMedida,
  updateActasMedida,
  deleteActasMedida,
  anularActasMedida,
};
