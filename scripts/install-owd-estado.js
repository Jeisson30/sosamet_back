/**
 * Agrega owd_estado a order_work_detail (local).
 * Uso: node scripts/install-owd-estado.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'order_work_detail'
       AND COLUMN_NAME = 'owd_estado'`
  );

  if (cols.length) {
    console.log('owd_estado ya existe — OK');
  } else {
    await conn.query(`
      ALTER TABLE order_work_detail
        ADD COLUMN owd_estado TINYINT NOT NULL DEFAULT 1
        COMMENT '1=Pendiente, 2=Completado, 3=Anulado'
        AFTER observaciones
    `);
    console.log('Columna owd_estado agregada');
  }

  await conn.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
