/**
 * Tabla contrato_grilla_acta — estado de grilla por contrato (actas de medida).
 * Uso: node scripts/install-contrato-grilla-acta.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  const sql = fs.readFileSync(
    path.join(__dirname, 'sql-prod', 'CREATE_contrato_grilla_acta.sql'),
    'utf8'
  );
  await conn.query(sql);
  console.log('OK  contrato_grilla_acta');
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
