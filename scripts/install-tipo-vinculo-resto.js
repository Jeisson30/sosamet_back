require('dotenv').config();
const mysql = require('mysql2/promise');

async function addColumnIfMissing(conn, table, column, ddl) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number(rows[0]?.n) > 0) {
    console.log(`OK  ${table}.${column}`);
    return;
  }
  await conn.query(ddl);
  console.log(`ADD ${table}.${column}`);
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await addColumnIfMissing(
    conn,
    'ejecucion_corte_adicional',
    'tipo_vinculo',
    `ALTER TABLE ejecucion_corte_adicional
       ADD COLUMN tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
       AFTER contrato_no`
  );
  await addColumnIfMissing(
    conn,
    'liquidacion_corte_plano',
    'tipo_vinculo',
    `ALTER TABLE liquidacion_corte_plano
       ADD COLUMN tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
       AFTER no_contrato`
  );

  await conn.end();
  console.log('LISTO');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
