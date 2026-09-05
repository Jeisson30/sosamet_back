/**
 * Crea tabla documento_numero (catálogo N° por constructora/proyecto/tipo).
 * Uso: node scripts/install-documento-numero.js
 * Prod: scripts/sql-prod/CREATE_documento_numero.sql
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
    'CREATE_documento_numero.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await conn.query(sql);
  console.log('OK tabla documento_numero');

  const [cols] = await conn.query(`SHOW COLUMNS FROM documento_numero`);
  console.table(cols.map((c) => ({ Field: c.Field, Type: c.Type, Key: c.Key })));

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
