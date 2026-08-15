const db = require("../../../config/db");

/**
 * Consulta actas/planos disponibles para orden de trabajo.
 * SP_CONSULTAR_ACTAS_PLANOS_DISPONIBLES_OT → 2 resultsets (cabecera, detalle).
 *
 * estado_asignacion:
 *   2 = disponible (pendiente)
 *   4 = ya asignada a una OT (finalizada en el contador)
 */
const consultActasPlanosDisponiblesOt = (req, res) => {
  db.query(
    "CALL SP_CONSULTAR_ACTAS_PLANOS_DISPONIBLES_OT()",
    [],
    (err, results) => {
      if (err) {
        console.error("Error al consultar actas/planos disponibles OT:", err);
        return res.status(500).json({
          mensaje: "Error al consultar actas y planos disponibles para OT.",
          error: err.message,
        });
      }

      const cabecera = Array.isArray(results?.[0]) ? results[0] : [];
      const detalle = Array.isArray(results?.[1]) ? results[1] : [];

      // Por acta: true solo si TODOS sus planos tienen estado_asignacion = 4
      const actaAsignada = new Map();

      cabecera.forEach((r) => {
        const key = String(r.consecutivo || "").trim();
        if (!key) return;
        const asignada = Number(r.estado_asignacion) === 4;
        if (!actaAsignada.has(key)) {
          actaAsignada.set(key, asignada);
        } else {
          actaAsignada.set(key, actaAsignada.get(key) && asignada);
        }
      });

      let pendientes = 0;
      let finalizadas = 0;
      actaAsignada.forEach((asignada) => {
        if (asignada) finalizadas += 1;
        else pendientes += 1;
      });

      return res.status(200).json({
        dashboard: {
          pendientes,
          finalizadas,
          total: actaAsignada.size,
        },
        cabecera,
        detalle,
      });
    }
  );
};

module.exports = { consultActasPlanosDisponiblesOt };
