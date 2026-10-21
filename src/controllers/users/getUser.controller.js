const db = require('../../config/db');

const enrichAccountMode = (rows, done) => {
  if (!rows || !rows.length) {
    return done(null, []);
  }
  const ids = rows
    .map((r) => Number(r.id_usuario))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) {
    return done(
      null,
      rows.map((r) => ({ ...r, account_mode: r.account_mode || 'FULL' }))
    );
  }
  db.query(
    `SELECT id_usuario, IFNULL(account_mode, 'FULL') AS account_mode
       FROM usuarios WHERE id_usuario IN (?)`,
    [ids],
    (err, modes) => {
      if (err) {
        // Column missing or query error: keep list without blocking admin UI.
        return done(
          null,
          rows.map((r) => ({ ...r, account_mode: r.account_mode || 'FULL' }))
        );
      }
      const map = new Map(
        (modes || []).map((m) => [Number(m.id_usuario), m.account_mode || 'FULL'])
      );
      return done(
        null,
        rows.map((r) => ({
          ...r,
          account_mode: map.get(Number(r.id_usuario)) || 'FULL',
        }))
      );
    }
  );
};

const getUsers = (req, res) => {
  const modeFilter = String(req.query?.account_mode || '')
    .trim()
    .toUpperCase();

  db.query('CALL mostrar_usuarios()', (err, results) => {
    if (err) {
      return res.status(500).json({
        message: 'Error al consultar los usuarios',
        error: err,
      });
    }

    enrichAccountMode(results[0] || [], (_e, enriched) => {
      let data = enriched;
      if (modeFilter === 'FULL' || modeFilter === 'DIRECTORY') {
        data = enriched.filter(
          (u) => String(u.account_mode || 'FULL').toUpperCase() === modeFilter
        );
      }
      return res.status(200).json(data);
    });
  });
};

module.exports = { getUsers };
