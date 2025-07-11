const db = require("../../config/db");

const updateUser = (req, res) => {
    const { p_nit, p_nombre, p_apellido, p_email, p_rol } = req.body;

    if (!p_nit || !p_nombre || !p_apellido || !p_email || !p_rol) {
        return res.status(400).json({
            message:
                "Todos los campos son obligatorios para actualizar el usuario",
        });
    }

    db.query(
        "CALL sp_actualizar_usuario(?, ?, ?, ?, ?)",
        [p_nit, p_nombre, p_apellido, p_email, p_rol],
        (err, results) => {
            if (err) {
                if (err.sqlState === "45000") {
                    return res.status(400).json({ message: err.message });
                }

                return res.status(500).json({
                    message: "Error al actualizar usuario",
                    error: err,
                });
            }

            const message =
                results[0][0]?.message || "Usuario actualizado correctamente";
            const code = results[0][0]?.code || 1;

            res.status(200).json({ code, message });
        }
    );
};

module.exports = { updateUser };
