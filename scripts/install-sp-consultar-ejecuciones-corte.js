/**
 * Instala SPs de consulta/mantención de Ejecución de Cortes.
 * Uso: node scripts/install-sp-consultar-ejecuciones-corte.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const mysql = require('mysql2/promise');

(async () => {
  const sqlPath = path.join(
    __dirname,
    'sql-prod',
    'SP_CONSULTAR_EJECUCIONES_CORTE.sql'
  );
  let sql = fs.readFileSync(sqlPath, 'utf8');
  sql = sql
    .replace(/DELIMITER\s+\$\$/gi, '')
    .replace(/DELIMITER\s+;/gi, '')
    .replace(/\$\$/g, ';');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    const [rs] = await conn.query(
      'CALL SP_CONSULTAR_EJECUCIONES_CORTE(?,?,?,?)',
      [null, 0, null, null]
    );
    const rows = Array.isArray(rs?.[0]) ? rs[0] : [];
    console.log('OK: SPs consulta/mantención ejecución instalados.');
    console.log('Prueba listado →', rows.length, 'filas');
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error('ERROR:', e.sqlMessage || e.message);
  process.exit(1);
});
