const db = require('../config/db');

const queryAsync = (sql, values) =>
  new Promise((resolve, reject) => {
    db.query(sql, values, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

/**
 * Ejecuta trabajo dentro de una transacción MySQL.
 * Si cualquier query falla, hace ROLLBACK y rechaza la promesa.
 */
const runInTransaction = (work) =>
  new Promise((resolve, reject) => {
    db.beginTransaction((beginErr) => {
      if (beginErr) return reject(beginErr);

      const queryTx = (sql, values) => queryAsync(sql, values);

      Promise.resolve(work(queryTx))
        .then((result) => {
          db.commit((commitErr) => {
            if (commitErr) {
              return db.rollback(() => reject(commitErr));
            }
            resolve(result);
          });
        })
        .catch((workErr) => {
          db.rollback(() => reject(workErr));
        });
    });
  });

module.exports = { runInTransaction, queryAsync };
