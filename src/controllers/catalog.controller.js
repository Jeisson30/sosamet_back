const db = require('../config/db');

const getConstructoras = (req, res) => {
  db.query(
    `SELECT id_constructora AS id,
            nombre,
            nit,
            estado
       FROM sosamet.constructoras
      WHERE estado = 'ACTIVO'
      ORDER BY nombre`,
    (err, results) => {
      if (err) {
        return res.status(500).json({
          error: 'Error al consultar constructoras',
          detalle: err,
        });
      }
      return res.status(200).json(results || []);
    }
  );
};

const getProyectosByConstructora = (req, res) => {
  const { idConstructora } = req.params;

  db.query(
    `SELECT id_proyecto AS id,
            nombre,
            id_constructora AS idConstructora,
            estado
       FROM sosamet.proyectos_constructoras
      WHERE estado = 'ACTIVO'
        AND id_constructora = ?
      ORDER BY nombre`,
    [idConstructora],
    (err, results) => {
      if (err) {
        return res.status(500).json({
          error: 'Error al consultar proyectos',
          detalle: err,
        });
      }
      return res.status(200).json(results || []);
    }
  );
};

module.exports = {
  getConstructoras,
  getProyectosByConstructora,
};

