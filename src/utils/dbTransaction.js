const db = require('../config/db');

/**
 * Ejecuta trabajo dentro de una transacción MySQL (una conexión del pool).
 * Si cualquier query falla, hace ROLLBACK y rechaza la promesa.
 */
const runInTransaction = (work) =>
  new Promise((resolve, reject) => {
    db.getConnection((connErr, connection) => {
      if (connErr) return reject(connErr);

      const release = () => connection.release();

      const queryTx = (sql, values) =>
        new Promise((res, rej) => {
          connection.query(sql, values, (err, result) => {
            if (err) rej(err);
            else res(result);
          });
        });

      connection.beginTransaction((beginErr) => {
        if (beginErr) {
          release();
          return reject(beginErr);
        }

        Promise.resolve(work(queryTx))
          .then((result) => {
            connection.commit((commitErr) => {
              release();
              if (commitErr) return reject(commitErr);
              resolve(result);
            });
          })
          .catch((workErr) => {
            connection.rollback(() => {
              release();
              reject(workErr);
            });
          });
      });
    });
  });

const queryAsync = (sql, values) =>
  new Promise((resolve, reject) => {
    db.query(sql, values, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

module.exports = { runInTransaction, queryAsync };
