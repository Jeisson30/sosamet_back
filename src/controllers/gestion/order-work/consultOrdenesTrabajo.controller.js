const db = require("../../../config/db");

/**
 * Consulta órdenes de trabajo.
 * SP_CONSULTAR_ORDENES_TRABAJO → 2 resultsets (cabecera, detalle).
 *
 * Query params:
 *  buscar, encargado_id, fecha_desde, fecha_hasta,
 *  constructora, proyecto, contrato
 */
const consultOrdenesTrabajo = (req, res) => {
  const toNull = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  const toIntOrNull = (v) => {
    if (v === undefined || v === null || String(v).trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const buscar = toNull(req.query.buscar);
  const encargadoId = toIntOrNull(req.query.encargado_id);
  const fechaDesde = toNull(req.query.fecha_desde);
  const fechaHasta = toNull(req.query.fecha_hasta);
  const constructora = toNull(req.query.constructora);
  const proyecto = toNull(req.query.proyecto);
  const contrato = toNull(req.query.contrato);

  db.query(
    "CALL SP_CONSULTAR_ORDENES_TRABAJO(?,?,?,?,?,?,?)",
    [
      buscar,
      encargadoId,
      fechaDesde,
      fechaHasta,
      constructora,
      proyecto,
      contrato,
    ],
    (err, results) => {
      if (err) {
        console.error("Error al consultar órdenes de trabajo:", err);
        return res.status(500).json({
          mensaje: "Error al consultar órdenes de trabajo.",
          error: err.message,
        });
      }

      const cabecera = Array.isArray(results?.[0]) ? results[0] : [];
      const detalle = Array.isArray(results?.[1]) ? results[1] : [];

      return res.status(200).json({
        cabecera,
        detalle,
      });
    }
  );
};

module.exports = { consultOrdenesTrabajo };
