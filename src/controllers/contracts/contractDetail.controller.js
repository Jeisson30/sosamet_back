const db = require("../../config/db");

const getContractDetail = (req, res) => {
  const { tipo_doc, numerodoc } = req.params;

  if (!tipo_doc || !numerodoc) {
    return res.status(400).json({ mensaje: "tipo_doc y numerodoc son requeridos." });
  }

  db.query("CALL sp_consultar_documento_detalle(?, ?)", [tipo_doc, numerodoc], (err, results) => {
    if (err) {
      console.error("Error al consultar detalle del contrato:", err);
      return res.status(500).json({
        mensaje: "Error interno del servidor.",
        error: err.message,
      });
    }

    const resultado = results?.[0]?.[0];

    if (!resultado || (typeof resultado === "object" && resultado.mensaje?.startsWith("⚠️"))) {
      return res.status(404).json({
        mensaje: `No se encontraron datos para ${tipo_doc} con número ${numerodoc}.`,
      });
    }

    res.status(200).json({
      mensaje: `Detalle del documento tipo "${tipo_doc}" con número "${numerodoc}".`,
      data: resultado,
    });
  });
};

module.exports = { getContractDetail };
