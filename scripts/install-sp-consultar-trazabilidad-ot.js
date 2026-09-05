/**
 * Instala SP_CONSULTAR_TRAZABILIDAD_OT en la BD local (.env).
 * Uso: node scripts/install-sp-consultar-trazabilidad-ot.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const mysql = require('mysql2/promise');

(async () => {
  const sqlPath = path.join(__dirname, 'sql-prod', 'SP_CONSULTAR_TRAZABILIDAD_OT.sql');
  let sql = fs.readFileSync(sqlPath, 'utf8');

  // Quitar DELIMITER (cliente mysql); mysql2 no lo entiende
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
    const [test] = await conn.query('CALL SP_CONSULTAR_TRAZABILIDAD_OT(?)', [9]);
    const cab = Array.isArray(test?.[0]) ? test[0] : [];
    const det = Array.isArray(test?.[1]) ? test[1] : [];
    const act = Array.isArray(test?.[2]) ? test[2] : [];
    console.log('OK: SP_CONSULTAR_TRAZABILIDAD_OT instalado.');
    console.log(
      `Prueba OT id=9 → cabecera=${cab.length}, items=${det.length}, actas=${act.length}`
    );
    if (cab[0]) {
      console.log('  consecutivo:', cab[0].consecutivo, '| ejecucion:', cab[0].consecutivo_ejecucion);
    }
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error('ERROR:', e.sqlMessage || e.message);
  process.exit(1);
});
