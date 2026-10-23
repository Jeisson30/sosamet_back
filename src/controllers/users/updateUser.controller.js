const db = require("../../config/db");

const updateUser = (req, res) => {
    const { p_nit, p_nombre, p_apellido, p_email, p_rol } = req.body;

    const nit = String(p_nit ?? "").trim();
    const nombre = String(p_nombre ?? "").trim();
    const apellido = String(p_apellido ?? "").trim();
    const email = String(p_email ?? "").trim();
    const rol = Number(p_rol);

    if (!nit || !nombre || !apellido || !email || !Number.isFinite(rol) || rol <= 0) {
        return res.status(400).json({
            message:
                "Todos los campos son obligatorios para actualizar el usuario",
            code: 0,
        });
    }

    db.query(
        "CALL sp_actualizar_usuario(?, ?, ?, ?, ?)",
        [nit, nombre, apellido, email, rol],
        (err, results) => {
            if (err) {
                if (err.sqlState === "45000") {
                    return res.status(400).json({ message: err.message, code: 0 });
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
