/**
 * Registra archivo_acta (estadocampo=0) para ACTAS DE MEDIDA.
 * Uso: node scripts/install-parametros-archivo-acta.js
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

  const sqlPath = path.join(
    __dirname,
    'sql-prod',
    'INSERT_parametros_archivo_acta.sql'
  );
  await conn.query(fs.readFileSync(sqlPath, 'utf8'));
  console.log('OK parametros archivo_acta (Actas De Medida)');
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
