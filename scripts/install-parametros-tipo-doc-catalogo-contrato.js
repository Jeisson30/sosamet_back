/**
 * Registra tipo_doc_catalogo (estadocampo=0) para CONTRATO.
 * Uso: node scripts/install-parametros-tipo-doc-catalogo-contrato.js
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
    'INSERT_parametros_tipo_doc_catalogo_contrato.sql'
  );
  await conn.query(fs.readFileSync(sqlPath, 'utf8'));
  console.log('OK parametros tipo_doc_catalogo (CONTRATO)');

  const [rows] = await conn.query(
    `SELECT tipo_doc, nombre_campo_doc, estadocampo
       FROM parametros_documentos
      WHERE nombre_campo_doc = 'tipo_doc_catalogo'`
  );
  console.table(rows);

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
