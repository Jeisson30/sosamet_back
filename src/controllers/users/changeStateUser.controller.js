const db = require("../../config/db");

const changeStateUser = (req, res) => {
  const { p_id_usuario, p_nuevo_estado } = req.body;

  db.query(
    'CALL sp_cambiar_estado_usuario(?, ?, @p_resultado, @p_codigo)',
    [p_id_usuario, p_nuevo_estado],
    (err) => {
      if (err) {
        return res.status(500).json({ message: 'Error al actualizar usuario', error: err });
      }

      db.query('SELECT @p_resultado AS message, @p_codigo AS code', (err2, result2) => {
        if (err2) {
          return res.status(500).json({ message: 'Error al obtener resultado', error: err2 });
        }

        const message = result2[0].message;
        const code = result2[0].code;

        res.status(200).json({ message, code });
      });
    }
  );
};

module.exports = { changeStateUser };
