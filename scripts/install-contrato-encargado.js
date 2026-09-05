/**
 * Contrato Nuevo: encargado_contrato en parametros_documentos + ocultar nit_empresa.
 * Uso local: node scripts/install-contrato-encargado.js
 * Prod: ejecutar scripts/sql-prod/INSERT_encargado_contrato_parametros.sql
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const sqlPath = path.join(
    __dirname,
    'sql-prod',
    'INSERT_encargado_contrato_parametros.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  await conn.query(sql);
  console.log('OK  parametros_documentos: encargado_contrato + nit_empresa oculto');
  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
