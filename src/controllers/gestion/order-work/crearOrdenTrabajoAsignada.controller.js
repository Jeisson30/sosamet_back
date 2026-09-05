const db = require("../../../config/db");

const toMysqlDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
};

/**
 * Crea OT asignada desde actas/planos vía SP_CREAR_ORDEN_TRABAJO.
 * Body:
 *  consecutivo, empresa_asociada_id, encargado_id, fecha_entrega,
 *  observaciones, tipo_actividad, ot_constructora, ot_proyecto,
 *  ot_tipo_documento, ot_contrato, ot_autorizo, items: [{ amd_id }]
 */
const crearOrdenTrabajoAsignada = (req, res) => {
  const {
    consecutivo,
    empresa_asociada_id = null,
    encargado_id,
    fecha_entrega,
    observaciones,
    tipo_actividad,
    ot_constructora,
    ot_proyecto,
    ot_tipo_documento,
    ot_contrato,
    ot_autorizo,
    items,
  } = req.body || {};

  if (!consecutivo || String(consecutivo).trim() === "") {
    return res.status(400).json({
      Codigo: 0,
      Mensaje: "El consecutivo es obligatorio.",
    });
  }

  if (!encargado_id) {
    return res.status(400).json({
      Codigo: 0,
      Mensaje: "Debe indicar el encargado de la Orden de Trabajo.",
    });
  }

  if (!tipo_actividad || String(tipo_actividad).trim() === "") {
    return res.status(400).json({
      Codigo: 0,
      Mensaje: "Debe indicar el tipo de actividad.",
    });
  }

  const fechaMysql = toMysqlDate(fecha_entrega);
  if (!fechaMysql) {
    return res.status(400).json({
      Codigo: 0,
      Mensaje: "La fecha de entrega es obligatoria.",
    });
  }

  if (!ot_autorizo || String(ot_autorizo).trim() === "") {
    return res.status(400).json({
      Codigo: 0,
      Mensaje: "El campo Autorizo es obligatorio.",
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      Codigo: 0,
      Mensaje: "La Orden de Trabajo debe tener al menos un ítem.",
    });
  }

  const itemsJson = JSON.stringify(
    items
      .map((it) => ({ amd_id: Number(it.amd_id) }))
      .filter((it) => Number.isFinite(it.amd_id) && it.amd_id > 0)
  );

  if (!itemsJson || itemsJson === "[]") {
    return res.status(400).json({
      Codigo: 0,
      Mensaje: "Los ítems seleccionados no son válidos.",
    });
  }

  db.query(
    "CALL SP_CREAR_ORDEN_TRABAJO(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      String(consecutivo).trim(),
      empresa_asociada_id || null,
      Number(encargado_id),
      fechaMysql,
      observaciones || null,
      String(tipo_actividad).trim(),
      ot_constructora || null,
      ot_proyecto || null,
      ot_tipo_documento || null,
      ot_contrato || null,
      String(ot_autorizo).trim(),
      itemsJson,
    ],
    (err, results) => {
      if (err) {
        console.error("Error SP_CREAR_ORDEN_TRABAJO:", err);
        return res.status(500).json({
          Codigo: 0,
          Mensaje: "Ocurrió un error al crear la Orden de Trabajo.",
          error: err.message,
        });
      }

      const row = Array.isArray(results?.[0]) ? results[0][0] : results?.[0];
      const codigo = Number(row?.Codigo ?? row?.codigo ?? 0);
      const mensaje =
        row?.Mensaje ||
        row?.mensaje ||
        (codigo === 1
          ? "Orden de Trabajo creada correctamente."
          : "No se pudo crear la Orden de Trabajo.");

      if (codigo !== 1) {
        return res.status(400).json({
          Codigo: codigo,
          Mensaje: mensaje,
          id_order_work: row?.id_order_work ?? null,
          consecutivo: row?.consecutivo ?? consecutivo,
        });
      }

      const idOrderWork = row?.id_order_work ?? null;

      // Hereda tipo_vinculo del acta/ítem (COTIZACION si el acta nació sin contrato).
      if (idOrderWork) {
        db.query(
          `UPDATE order_work OW
             INNER JOIN (
               SELECT OWD.id_order_work,
                      MAX(AMD.amd_tipo_vinculo) AS tipo_vinculo
                 FROM order_work_detail OWD
                 INNER JOIN actas_medida_detalle AMD
                   ON AMD.amd_id = OWD.amd_id
                WHERE OWD.id_order_work = ?
                GROUP BY OWD.id_order_work
             ) T ON T.id_order_work = OW.id_order_work
                SET OW.ot_tipo_vinculo = IFNULL(T.tipo_vinculo, 'CONTRATO')
              WHERE OW.id_order_work = ?`,
          [idOrderWork, idOrderWork],
          (updErr) => {
            if (updErr) {
              console.error(
                "Aviso: no se pudo sincronizar ot_tipo_vinculo:",
                updErr.message
              );
            }
          }
        );
      }

      return res.status(200).json({
        Codigo: 1,
        Mensaje: mensaje,
        id_order_work: idOrderWork,
        consecutivo: row?.consecutivo ?? consecutivo,
        estado: row?.estado ?? 1,
      });
    }
  );
};

module.exports = { crearOrdenTrabajoAsignada };
