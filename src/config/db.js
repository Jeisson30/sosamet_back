const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config({ override: true });

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

connection.connect((err) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err);
    return;
  }
  console.log(
    `//===== Conectado a MySQL (${process.env.DB_HOST})  =====  \\`
  );
});

if (process.env.NODE_ENV !== 'production') {
  connection.query(
    "SET NAMES utf8mb4 COLLATE utf8mb4_general_ci",
    (err) => {
      if (err) {
        console.error('Error configurando collation:', err);
      } else {
        console.log('✅ Collation configurada a utf8mb4_general_ci');
      }
    }
  );
}

module.exports = connection;
