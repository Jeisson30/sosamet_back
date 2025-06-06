const db = require("../../config/db");

const getUsers = (req, res) => {
    db.query("CALL mostrar_usuarios()", (err, results) => {
        if (err) {
            return res.status(500).json({
                message: "Error al consultar los usuarios",
                error: err,
            });
        }
        res.status(200).json(results[0]);
    });
};

module.exports = { getUsers };
