const db = require("../../config/db");

const getCompanies = async (req, res) => {
  try {
    db.query("CALL sp_consultar_empresas()", (err, results) => {
      if (err) {
        console.error("Error al consultar las empresas:", err);
        return res.status(500).json({
          message: "Error al consultar las empresas",
          error: err,
        });
      }

      return res.status(200).json(results[0]);
    });
  } catch (error) {
    console.error("Excepción en getCompanies:", error);
    res.status(500).json({
      message: "Error interno al consultar las empresas",
      error: error.message,
    });
  }
};

module.exports = { getCompanies };
