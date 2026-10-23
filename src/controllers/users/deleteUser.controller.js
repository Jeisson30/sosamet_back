const db = require('../../config/db');

const deleteUser = (req, res) => {
  const { p_id_usuario } = req.body;

  const idUsuario = Number(p_id_usuario);
  if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
    return res.status(400).json({
      message: 'id_usuario inválido. La eliminación no se aplicó.',
      code: 0,
    });
  }

  db.query(
    'CALL sp_eliminar_usuario(?, @p_resultado, @p_codigo)',
    [idUsuario],
    (err) => {
      if (err) {
        return res.status(500).json({
          message: 'Error al eliminar usuario',
          error: err,
        });
      }

      db.query(
        'SELECT @p_resultado AS message, @p_codigo AS code',
        (err2, result2) => {
          if (err2) {
            return res.status(500).json({
              message: 'Error al obtener resultado',
              error: err2,
            });
          }

          const message = result2[0].message;
          const code = result2[0].code;

          res.status(200).json({ message, code });
        }
      );
    }
  );
};

module.exports = { deleteUser };
