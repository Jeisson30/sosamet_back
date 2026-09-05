require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const [rs] = await c.query('CALL SP_CONSULTAR_EJECUCIONES_CORTE(?,?,?,?)', [
      null,
      0,
      null,
      null,
    ]);
    const rows = Array.isArray(rs?.[0]) ? rs[0] : [];
    console.log('OK rows=', rows.length);
    if (rows[0]) console.log(JSON.stringify(rows[0], null, 2));
  } catch (e) {
    console.error('FAIL:', e.sqlMessage || e.message);
  }

  await c.end();
})();
