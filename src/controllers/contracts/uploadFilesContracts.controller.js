const fs = require("fs");
const { runInTransaction } = require("../../utils/dbTransaction");
const { insertAiuRowsFromSheet } = require("../../services/contractPlano.service");
const { notifyDocumentCreated } = require('../../utils/documentCreatedEmail');

const uploadExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se proporcionó un archivo." });
  }

  const tipo_doc = req.body.tipo_doc || "Contrato";
  const filePath = req.file.path;

  try {
    const numdoc = await runInTransaction((queryTx) =>
      insertAiuRowsFromSheet(queryTx, filePath, tipo_doc, null, {
        validateContrato: false,
      })
    );

    fs.unlinkSync(filePath);

    res
      .status(200)
      .json({ message: "Archivo procesado y datos insertados correctamente." });

    void notifyDocumentCreated({
      reqUser: req.user,
      tipo_doc,
      numerodoc: numdoc,
    });
  } catch (error) {
    console.error("Error al procesar archivo Excel:", error);
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    res.status(500).json({
      error: "Error al procesar archivo Excel",
      detalle: error.message,
      mensaje:
        "No se insertó ninguna fila del archivo. Los datos no fueron registrados.",
    });
  }
};

module.exports = { uploadExcel };
