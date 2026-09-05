const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  const [cols] = await c.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ejecucion_corte_adicional'
       AND COLUMN_NAME = 'adc_estado'`
  );

  if (!cols.length) {
    await c.query(`
      ALTER TABLE ejecucion_corte_adicional
        ADD COLUMN adc_estado TINYINT NOT NULL DEFAULT 1
          COMMENT '1=Pendiente, 2=Completado'
          AFTER observaciones,
        ADD COLUMN adc_fecha_finalizado DATETIME NULL
          AFTER adc_estado
    `);
    console.log('+ adc_estado / adc_fecha_finalizado');
  } else {
    console.log('adc_estado ya existe');
  }

  await c.query('DROP PROCEDURE IF EXISTS SP_CONSULTAR_ACTIVIDADES_ADICIONALES_OT');
  await c.query(`
CREATE PROCEDURE SP_CONSULTAR_ACTIVIDADES_ADICIONALES_OT(
    IN p_id_order_work INT
)
BEGIN
    SELECT
        id_adicional,
        id_ejecucion,
        id_order_work,
        item,
        contrato_no,
        proyecto,
        descripcion,
        cantidad,
        um,
        ancho,
        alto,
        acta_medida_no,
        orden_no,
        plano_no,
        observaciones,
        adc_estado,
        adc_fecha_finalizado,
        fecha_creacion
    FROM ejecucion_corte_adicional
    WHERE id_order_work = p_id_order_work
    ORDER BY id_adicional ASC;
END
  `);
  console.log('OK SP_CONSULTAR_ACTIVIDADES_ADICIONALES_OT');
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
