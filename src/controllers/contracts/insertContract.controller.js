const db = require("../../config/db");
const { notifyDocumentCreated } = require("../../utils/documentCreatedEmail");

const dbp = db.promise();

const insertContract = async (req, res) => {
  const { tipo_doc, numerodoc, campos } = req.body;

  if (!tipo_doc || !numerodoc || !Array.isArray(campos)) {
    return res.status(400).json({
      mensaje: "tipo_doc, numerodoc y campos son requeridos.",
    });
  }

  const doc = String(numerodoc).trim();
  const tipo = String(tipo_doc).trim();

  try {
    // Actas: evitar choque si dos usuarios abrieron el mismo peek
    if (tipo.toUpperCase() === "ACTAS DE MEDIDA") {
      const [existing] = await dbp.query(
        `SELECT numerodoc
           FROM item_documentos
          WHERE UPPER(TRIM(tipo_doc)) = 'ACTAS DE MEDIDA'
            AND TRIM(numerodoc) = ?
          LIMIT 1`,
        [doc]
      );
      if (Array.isArray(existing) && existing.length > 0) {
        return res.status(409).json({
          mensaje: `Ya existe un acta con el consecutivo ${doc}. Se asignará el siguiente automáticamente; intente guardar de nuevo.`,
          codigo: "CONSECUTIVO_DUPLICADO",
        });
      }
    }

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

      await dbp.execute("CALL sp_insertar_item_documento(?, ?, ?, ?)", [
        tipo,
        doc,
        nombre,
        valor,
      ]);

      resultados.push({
        campo: nombre,
        mensaje: "SE REALIZO LA INSERCION CORRECTAMENTE.",
      });
    }

    res.status(200).json({
      mensaje: `Documento tipo "${tipo}" procesado.`,
      resultados,
    });

    void notifyDocumentCreated({
      reqUser: req.user,
      tipo_doc: tipo,
      numerodoc: doc,
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
