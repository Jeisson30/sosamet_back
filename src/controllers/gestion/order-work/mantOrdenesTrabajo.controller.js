const db = require("../../../config/db");

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

const toDateOrNull = (v) => {
  const s = toNull(v);
  if (!s) return null;
  if (s instanceof Date) {
    const y = s.getFullYear();
    const m = String(s.getMonth() + 1).padStart(2, "0");
    const d = String(s.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(s);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw;
};

const firstRow = (results) => {
  if (Array.isArray(results?.[0]) && results[0][0]) return results[0][0];
  if (Array.isArray(results) && results[0] && !Array.isArray(results[0])) {
    return results[0];
  }
  return null;
};

/**
 * Actualiza OT — SP_ACTUALIZAR_ORDEN_TRABAJO
 */
const updateOrdenTrabajo = (req, res) => {
  const body = req.body || {};
  const id = toNumOrNull(body.id_order_work);

  if (!id) {
    return res.status(400).json({ mensaje: "id_order_work es obligatorio." });
  }

  const params = [
    id,
    body.actualizar_cabecera ? 1 : 0,
    body.actualizar_detalle ? 1 : 0,
    toNumOrNull(body.encargado_id),
    toDateOrNull(body.fecha_entrega),
    toNull(body.observaciones),
    toNull(body.tipo_actividad),
    toNull(body.constructora),
    toNull(body.proyecto),
    toNull(body.tipo_documento),
    toNull(body.numero_contrato ?? body.contrato),
    toNull(body.autorizo),
    toNumOrNull(body.empresa_asociada_id),
    toNumOrNull(body.id_order_work_detail),
    toNull(body.item),
    toNull(body.ref),
    toNull(body.descripcion),
    toNumOrNull(body.cantidad),
    toNull(body.um),
    toNumOrNull(body.ancho),
    toNumOrNull(body.alto),
    toNull(body.observaciones_item),
  ];

  db.query(
    "CALL SP_ACTUALIZAR_ORDEN_TRABAJO(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    params,
    (err, results) => {
      if (err) {
        console.error("Error al actualizar orden de trabajo:", err);
        return res.status(500).json({
          mensaje: err.sqlMessage || "Error al actualizar la orden de trabajo.",
          error: err.message,
        });
      }

      const row = firstRow(results);
      return res.status(200).json({
        mensaje: row?.mensaje || "Orden actualizada correctamente.",
        resultado: row?.resultado ?? 1,
        id_order_work: row?.id_order_work ?? id,
      });
    }
  );
};

/**
 * Anula OT — SP_ANULAR_ORDEN_TRABAJO (ot_estado = 3)
 */
const anularOrdenTrabajo = (req, res) => {
  const body = req.body || {};
  const id = toNumOrNull(body.id_order_work);

  if (!id) {
    return res.status(400).json({ mensaje: "id_order_work es obligatorio." });
  }

  const usuario = Number(req.user?.id_usuario ?? body.usuario ?? 0);
  if (!Number.isFinite(usuario) || usuario <= 0) {
    return res.status(401).json({
      mensaje: "No se pudo identificar el usuario que anula.",
    });
  }

  db.query(
    "CALL SP_ANULAR_ORDEN_TRABAJO(?, ?)",
    [id, usuario],
    (err, results) => {
      if (err) {
        console.error("Error al anular orden de trabajo:", err);
        return res.status(500).json({
          mensaje: err.sqlMessage || "Error al anular la orden de trabajo.",
          error: err.message,
        });
      }

      const row = firstRow(results);
      return res.status(200).json({
        mensaje: row?.mensaje || "Orden anulada correctamente.",
        resultado: row?.resultado ?? 1,
        id_order_work: row?.id_order_work ?? id,
        estado: row?.estado ?? 3,
      });
    }
  );
};

/**
 * Elimina OT — SP_ELIMINAR_ORDEN_TRABAJO
 */
const deleteOrdenTrabajo = (req, res) => {
  const body = req.body || {};
  const id = toNumOrNull(body.id_order_work);

  if (!id) {
    return res.status(400).json({ mensaje: "id_order_work es obligatorio." });
  }

  db.query("CALL SP_ELIMINAR_ORDEN_TRABAJO(?)", [id], (err, results) => {
    if (err) {
      console.error("Error al eliminar orden de trabajo:", err);
      return res.status(500).json({
        mensaje: err.sqlMessage || "Error al eliminar la orden de trabajo.",
        error: err.message,
      });
    }

    const row = firstRow(results);
    return res.status(200).json({
      mensaje: row?.mensaje || "Orden eliminada correctamente.",
      resultado: row?.resultado ?? 1,
      id_order_work: row?.id_order_work ?? id,
    });
  });
};

module.exports = {
  updateOrdenTrabajo,
  anularOrdenTrabajo,
  deleteOrdenTrabajo,
};
