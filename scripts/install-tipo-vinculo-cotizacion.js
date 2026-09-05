/**
 * Instala columnas tipo_vinculo + SP actas con discriminador CONTRATO|COTIZACION.
 * Uso local: node scripts/install-tipo-vinculo-cotizacion.js
 * Prod: ejecutar scripts/sql-prod/ALTER_tipo_vinculo_cotizacion.sql
 *       y scripts/sql-prod/SP_INSERTAR_ACTAS_MEDIDA_PLANO.sql en Workbench.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.n) > 0;
}

async function addColumnIfMissing(conn, table, column, ddl) {
  if (await columnExists(conn, table, column)) {
    console.log(`OK  ${table}.${column} ya existe`);
    return;
  }
  await conn.query(ddl);
  console.log(`ADD ${table}.${column}`);
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  console.log('=== ALTER tipo_vinculo ===');
  await addColumnIfMissing(
    conn,
    'actas_medida_detalle',
    'amd_tipo_vinculo',
    `ALTER TABLE actas_medida_detalle
       ADD COLUMN amd_tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
       COMMENT 'CONTRATO | COTIZACION'
       AFTER amd_numero_contrato`
  );
  await addColumnIfMissing(
    conn,
    'order_work',
    'ot_tipo_vinculo',
    `ALTER TABLE order_work
       ADD COLUMN ot_tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
       COMMENT 'CONTRATO | COTIZACION'
       AFTER ot_contrato`
  );
  await addColumnIfMissing(
    conn,
    'remisiones_plano',
    'tipo_vinculo',
    `ALTER TABLE remisiones_plano
       ADD COLUMN tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
       COMMENT 'CONTRATO | COTIZACION'
       AFTER contrato`
  );
  await addColumnIfMissing(
    conn,
    'orden_compra',
    'tipo_vinculo',
    `ALTER TABLE orden_compra
       ADD COLUMN tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
       COMMENT 'CONTRATO | COTIZACION'
       AFTER contrato`
  );

  console.log('=== SP sp_insertar_actas_medida_plano ===');
  await conn.query('DROP PROCEDURE IF EXISTS sp_insertar_actas_medida_plano');
  await conn.query(`
CREATE PROCEDURE sp_insertar_actas_medida_plano(
    IN p_consecutivo VARCHAR(50),
    IN p_numero_contrato VARCHAR(50),
    IN p_item VARCHAR(50),
    IN p_detalle VARCHAR(1000),
    IN p_cantidad DECIMAL(18,2),
    IN p_unidad_medida VARCHAR(20),
    IN p_ancho DECIMAL(18,3),
    IN p_alto DECIMAL(18,3),
    IN p_observaciones TEXT,
    IN p_evidencia VARCHAR(500),
    IN p_usuario_creacion INT,
    IN p_tipo_vinculo VARCHAR(20)
)
BEGIN
    DECLARE v_tipo VARCHAR(20);

    SET v_tipo = UPPER(TRIM(IFNULL(p_tipo_vinculo, 'CONTRATO')));
    IF v_tipo NOT IN ('CONTRATO', 'COTIZACION') THEN
        SET v_tipo = 'CONTRATO';
    END IF;

    INSERT INTO actas_medida_detalle
    (
        amd_consecutivo,
        amd_numero_contrato,
        amd_tipo_vinculo,
        amd_item,
        amd_detalle,
        amd_cantidad,
        amd_unidad_medida,
        amd_ancho,
        amd_alto,
        amd_observaciones,
        amd_evidencia,
        amd_usuario_creacion
    )
    VALUES
    (
        p_consecutivo,
        p_numero_contrato,
        v_tipo,
        p_item,
        p_detalle,
        p_cantidad,
        p_unidad_medida,
        p_ancho,
        p_alto,
        p_observaciones,
        p_evidencia,
        p_usuario_creacion
    );
END
  `);
  console.log('OK  sp_insertar_actas_medida_plano recreado');

  await conn.end();
  console.log('=== LISTO ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
