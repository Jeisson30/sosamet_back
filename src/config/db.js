const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config({ override: true });

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err);
    return;
  }
  console.log(
    `//===== Conectado a MySQL (${process.env.DB_HOST})  =====  \\`
  );
  connection.release();
});

pool.on('connection', (connection) => {
  if (process.env.NODE_ENV !== 'production') {
    connection.query('SET NAMES utf8mb4 COLLATE utf8mb4_general_ci', (setErr) => {
      if (setErr) {
        console.error('Error configurando collation:', setErr);
      }
    });
  }
});

module.exports = pool;
