/**
 * Backfill adicionales legados: usuario_id desde OT.encargado_id
 * (filas creadas antes del modelo global por usuario)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [r1] = await c.query(`
    UPDATE ejecucion_corte_adicional A
    INNER JOIN order_work OW ON OW.id_order_work = A.id_order_work
       SET A.usuario_id = OW.encargado_id
     WHERE A.usuario_id IS NULL
       AND A.id_order_work IS NOT NULL
       AND OW.encargado_id IS NOT NULL
  `);
  console.log('usuario_id desde OT.encargado_id:', r1.affectedRows);

  // Si hay ejecución ligada, copiar empresa_asociada_id como empresa_id
  const [r2] = await c.query(`
    UPDATE ejecucion_corte_adicional A
    INNER JOIN ejecucion_corte EC ON EC.id_ejecucion = A.id_ejecucion
       SET A.empresa_id = EC.empresa_asociada_id
     WHERE A.empresa_id IS NULL
       AND A.id_ejecucion IS NOT NULL
       AND EC.empresa_asociada_id IS NOT NULL
  `);
  console.log('empresa_id desde ejecucion_corte:', r2.affectedRows);

  // Si aún falta empresa y la OT tiene empresa_asociada_id
  const [r3] = await c.query(`
    UPDATE ejecucion_corte_adicional A
    INNER JOIN order_work OW ON OW.id_order_work = A.id_order_work
       SET A.empresa_id = OW.empresa_asociada_id
     WHERE A.empresa_id IS NULL
       AND OW.empresa_asociada_id IS NOT NULL
  `);
  console.log('empresa_id desde order_work:', r3.affectedRows);

  const [left] = await c.query(`
    SELECT id_adicional, usuario_id, empresa_id, tipo_actividad, adc_estado, id_order_work
      FROM ejecucion_corte_adicional
     ORDER BY id_adicional
  `);
  console.table(left);
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
