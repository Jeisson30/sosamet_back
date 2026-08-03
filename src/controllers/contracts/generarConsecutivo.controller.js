const db = require("../../config/db");

const ejecutarQuery = (sql, values) => {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error al ejecutar consulta:", err);
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

/**
 * Genera consecutivo vía SP_GENERAR_CONSECUTIVO(tipo).
 * Ejemplo tipo: ACTA_MEDIDA
 * Respuesta SP: exitoso, consecutivo, numero
 */
const generarConsecutivo = async (req, res) => {
  try {
    const tipo = String(req.body?.tipo ?? "").trim().toUpperCase();

    if (!tipo) {
      return res.status(400).json({
        mensaje: "El tipo de documento es obligatorio (ej. ACTA_MEDIDA).",
      });
    }

    const results = await ejecutarQuery("CALL SP_GENERAR_CONSECUTIVO(?)", [tipo]);
    const row = Array.isArray(results?.[0]) ? results[0][0] : results?.[0];

    if (!row) {
      return res.status(500).json({
        mensaje: "El SP no devolvió datos de consecutivo.",
      });
    }

    const exitoso = Number(
      row.exitoso ?? row.Exitoso ?? row.EXITOSO ?? row.exito ?? 0
    );
    const consecutivo = String(
      row.consecutivo ?? row.Consecutivo ?? row.CONSECUTIVO ?? ""
    ).trim();
    const numero = Number(
      row.numero ?? row.Numero ?? row.NUMERO ?? row.numero_consecutivo ?? 0
    );

    if (exitoso !== 1 || !consecutivo) {
      return res.status(400).json({
        mensaje: "No se pudo generar el consecutivo.",
        exitoso,
        consecutivo: consecutivo || null,
        numero: Number.isFinite(numero) ? numero : null,
      });
    }

    return res.status(200).json({
      mensaje: "Consecutivo generado correctamente.",
      exitoso: 1,
      consecutivo,
      numero: Number.isFinite(numero) ? numero : null,
    });
  } catch (error) {
    console.error("❌ Error al generar consecutivo:", error);
    return res.status(500).json({
      mensaje: "Error interno al generar el consecutivo.",
      error: error.message,
    });
  }
};

module.exports = { generarConsecutivo };
