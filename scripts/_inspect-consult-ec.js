require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  for (const t of ['ejecucion_corte', 'order_work', 'empresa', 'order_work_detail']) {
    const [r] = await c.query(`SHOW COLUMNS FROM ${t}`);
    console.log('\n' + t + ':');
    console.log(r.map((x) => x.Field).join(', '));
  }

  const [p] = await c.query(
    `SELECT ROUTINE_NAME AS name FROM information_schema.ROUTINES
     WHERE ROUTINE_SCHEMA = DATABASE()
       AND ROUTINE_NAME LIKE '%EJECUCION%'`
  );
  console.log('\nSPs:');
  console.table(p);

  const [sample] = await c.query(
    `SELECT id_ejecucion, consecutivo, id_order_work, estado, tipo_corte
     FROM ejecucion_corte LIMIT 5`
  );
  console.log('\nejecuciones sample:');
  console.table(sample);

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
