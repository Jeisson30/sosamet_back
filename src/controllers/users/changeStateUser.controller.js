const db = require("../../config/db");

const changeStateUser = (req, res) => {
  const { p_id_usuario, p_nuevo_estado } = req.body;

  const idUsuario = Number(p_id_usuario);
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    return res.status(400).json({
      message: "id_usuario inválido. La acción no se aplicó.",
      code: 0,
    });
  }

  const nuevoEstado = String(p_nuevo_estado || "")
    .trim()
    .toUpperCase();
  if (!["ACTIVO", "INACTIVO", "BLOQUEADO"].includes(nuevoEstado)) {
    return res.status(400).json({
      message: "Estado inválido. Use ACTIVO, INACTIVO o BLOQUEADO.",
      code: 0,
    });
  }

  db.query(
    "CALL sp_cambiar_estado_usuario(?, ?, @p_resultado, @p_codigo)",
    [idUsuario, nuevoEstado],
    (err) => {
      if (err) {
        return res
          .status(500)
          .json({ message: "Error al actualizar usuario", error: err });
      }

      db.query(
        "SELECT @p_resultado AS message, @p_codigo AS code",
        (err2, result2) => {
          if (err2) {
            return res
              .status(500)
              .json({ message: "Error al obtener resultado", error: err2 });
          }

          const message = result2[0].message;
          const code = result2[0].code;

          res.status(200).json({ message, code });
        }
      );
    }
  );
};

module.exports = { changeStateUser };
