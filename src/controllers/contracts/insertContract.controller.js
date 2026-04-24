const db = require("../../config/db");
const { notifyDocumentCreated } = require('../../utils/documentCreatedEmail');

const insertContract = async (req, res) => {
  const { tipo_doc, numerodoc, campos, acta_plano_id } = req.body;

  if (!tipo_doc || !numerodoc || !Array.isArray(campos)) {
    return res.status(400).json({
      mensaje: "tipo_doc, numerodoc y campos son requeridos.",
    });
  }

  try {
    const resultados = [];

    for (const campo of campos) {
      const { nombre, valor } = campo;

      if (!nombre || typeof valor !== "string") {
        resultados.push({
          campo: nombre || "desconocido",
          mensaje: "Campo inválido, se omitió.",
        });
        continue;
      }

      const result = await db.execute(
        "CALL sp_insertar_item_documento(?, ?, ?, ?)",
        [tipo_doc, numerodoc, nombre, valor]
      );

      resultados.push({
        campo: nombre,
        mensaje: "SE REALIZO LA INSERCION CORRECTAMENTE.",
      });
    }

    // SOLO PARA ACTAS DE PAGO
    if (tipo_doc === "ACTAS DE PAGO" && acta_plano_id) {

      try {

        const empresa = campos.find(c => c.nombre === "empresa")?.valor || null;
        const observaciones = campos.find(c => c.nombre === "observaciones")?.valor || null;

        const retencionesResult = await new Promise((resolve, reject) => {
          db.query(
            `
            SELECT SUM(
              IFNULL(vr_rte_fte,0) +
              IFNULL(vr_rte_ica,0) +
              IFNULL(vr_rte_iva,0) +
              IFNULL(vr_rte_garantia,0) +
              IFNULL(vr_fic,0)
            ) AS total_retenciones
            FROM actas_pago_plano_detalle
            WHERE acta_pago_id = ?
            `,
            [acta_plano_id],
            (err, result) => {
              if (err) reject(err);
              else resolve(result);
            }
          );
        });

        const baseRetenciones = retencionesResult[0]?.total_retenciones || 0;

        await new Promise((resolve, reject) => {
          db.query(
            `
            UPDATE actas_pago_plano
            SET 
              numerodoc = ?,
              empresa = ?,
              observaciones = ?,
              base_retenciones = ?
            WHERE id = ?
            `,
            [
              numerodoc,
              empresa,
              observaciones,
              baseRetenciones,
              acta_plano_id
            ],
            (err, result) => {
              if (err) reject(err);
              else resolve(result);
            }
          );
        });

      } catch (errorInterno) {
        console.error("Error consolidando acta de pago:", errorInterno);
      }
    }
    res.status(200).json({
      mensaje: `Documento tipo "${tipo_doc}" procesado.`,
      resultados,
    });

    // Best-effort: correo informativo (no bloquea respuesta)
    void notifyDocumentCreated({
      reqUser: req.user,
      tipo_doc,
      numerodoc,
    });
  } catch (error) {
    console.error("❌ Error al insertar campos:", error);
    res.status(500).json({
      mensaje: "Error interno del servidor.",
      error: error.message,
    });
  }
};

module.exports = {
  insertContract,
};
