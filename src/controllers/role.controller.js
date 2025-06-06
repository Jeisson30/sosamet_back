const db = require('../config/db');

const getRoles = (req, res) => {
  db.query('CALL sp_perfiles_activos()', (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Error al obtener roles', error: err });
    }
    res.status(200).json(results[0]);
  });
};

module.exports = { getRoles };
