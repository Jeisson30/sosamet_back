const db = require("../../config/db");

/**
 * Lista números de contrato vía SP_CONSULTAR_CONTRATOS().
 * Normaliza columnas frecuentes para el front (numero_contrato / label).
 */
const consultarContratos = async (_req, res) => {
  try {
    db.query("CALL SP_CONSULTAR_CONTRATOS()", (err, results) => {
      if (err) {
        console.error("Error al consultar contratos:", err);
        return res.status(500).json({
          mensaje: "Error al consultar los contratos.",
          error: err.message,
        });
      }

      const rows = Array.isArray(results?.[0]) ? results[0] : [];

      const data = rows
        .map((row) => {
          const numero = String(
            row.numero_contrato ??
              row.Numero_Contrato ??
              row.NUMERO_CONTRATO ??
              row.numdoc ??
              row.numerodoc ??
              row.numero ??
              row.contrato ??
              row.Contrato ??
              row.CONTRATO ??
              ""
          ).trim();

          if (!numero) return null;

          const extra =
            row.proyecto ??
            row.constructora ??
            row.cliente ??
            row.descripcion ??
            null;

          return {
            ...row,
            numero_contrato: numero,
            label: extra ? `${numero} — ${extra}` : numero,
            value: numero,
          };
        })
        .filter(Boolean);

      return res.status(200).json({ data });
    });
  } catch (error) {
    console.error("Excepción en consultarContratos:", error);
    return res.status(500).json({
      mensaje: "Error interno al consultar los contratos.",
      error: error.message,
    });
  }
};

module.exports = { consultarContratos };
