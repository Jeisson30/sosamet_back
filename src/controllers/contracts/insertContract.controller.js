const db = require("../../config/db");

const insertContract = async (req, res) => {
  const { tipo_doc, numerodoc, campos } = req.body;

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

      // Ejecutar el SP sin desestructurar, porque no devuelve arrays
      const result = await db.execute(
        "CALL sp_insertar_item_documento(?, ?, ?, ?)",
        [tipo_doc, numerodoc, nombre, valor]
      );

      // Ya que no devuelve datos útiles, asumimos éxito por ejecución sin error
      resultados.push({
        campo: nombre,
        mensaje: "SE REALIZO LA INSERCION CORRECTAMENTE.",
      });
    }

    res.status(200).json({
      mensaje: `Documento tipo "${tipo_doc}" procesado.`,
      resultados,
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
