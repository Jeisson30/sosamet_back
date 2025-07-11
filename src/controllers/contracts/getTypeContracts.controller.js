const db = require("../../config/db");

const getTypeContracts = (req, res) => {
    db.query("CALL sp_obtener_tipo_documentos()", (err, results) => {
        if (err) {
            return res.status(500).json({
                message: "Error al consultar los tipos de documento",
                error: err,
            });
        }
        res.status(200).json(results[0]); 
    });
};

module.exports = { getTypeContracts };
