/**
 * Registra tipo_contrato (estadocampo=0) para persistir Contrato/Cotizacion/OfertaM…
 * junto al N° Documento del catálogo.
 *
 * Uso: node scripts/install-parametros-tipo-contrato-consecutivo.js
 * Prod: scripts/sql-prod/INSERT_parametros_tipo_contrato_consecutivo.sql
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
    'INSERT_parametros_tipo_contrato_consecutivo.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await conn.query(sql);
  console.log('OK parametros tipo_contrato (consecutivo)');

  const [rows] = await conn.query(
    `SELECT tipo_doc, nombre_campo_doc, estadocampo
       FROM parametros_documentos
      WHERE nombre_campo_doc = 'tipo_contrato'
      ORDER BY tipo_doc`
  );
  console.table(rows);

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
