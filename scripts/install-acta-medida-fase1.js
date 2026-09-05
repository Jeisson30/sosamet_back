/**
 * Fase 1 Actas de Medida: amd_fondo + SP contratos filtrados + SP insert con fondo.
 * Uso local: node scripts/install-acta-medida-fase1.js
 * Prod: ejecutar scripts/sql-prod/ALTER_amd_fondo.sql,
 *       SP_CONSULTAR_CONTRATOS_FILTRADOS.sql,
 *       SP_INSERTAR_ACTAS_MEDIDA_PLANO.sql
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

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  if (!(await columnExists(conn, 'actas_medida_detalle', 'amd_fondo'))) {
    await conn.query(`
      ALTER TABLE actas_medida_detalle
        ADD COLUMN amd_fondo DECIMAL(18,3) NULL
        COMMENT 'Profundidad / fondo medido en acta'
        AFTER amd_alto
    `);
    console.log('ADD actas_medida_detalle.amd_fondo');
  } else {
    console.log('OK  actas_medida_detalle.amd_fondo ya existe');
  }

  await conn.query('DROP PROCEDURE IF EXISTS SP_CONSULTAR_CONTRATOS_FILTRADOS');
  await conn.query(`
CREATE PROCEDURE SP_CONSULTAR_CONTRATOS_FILTRADOS(
    IN p_constructora VARCHAR(255),
    IN p_proyecto VARCHAR(255)
)
BEGIN
    SELECT
        t.numerodoc,
        t.numero_contrato,
        t.constructora,
        t.proyecto,
        t.tipo_contrato,
        t.tipo_doc_catalogo,
        t.fecha_inicio,
        t.fecha_fin,
        t.empresa_asociada,
        t.tipo_doc_contratista,
        t.numero_cotizacion
    FROM (
        SELECT
            c.numerodoc,
            MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'numero_contrato'
                THEN TRIM(c.valor_campo_doc) END) AS numero_contrato,
            MAX(CASE WHEN LOWER(c.nombre_campo_doc) IN ('empresa', 'constructora')
                THEN TRIM(c.valor_campo_doc) END) AS constructora,
            MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'proyecto'
                THEN TRIM(c.valor_campo_doc) END) AS proyecto,
            MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'tipo_contrato'
                THEN TRIM(c.valor_campo_doc) END) AS tipo_contrato,
            MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'tipo_doc_catalogo'
                THEN TRIM(c.valor_campo_doc) END) AS tipo_doc_catalogo,
            MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'fecha_inicio'
                THEN TRIM(c.valor_campo_doc) END) AS fecha_inicio,
            MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'fecha_fin'
                THEN TRIM(c.valor_campo_doc) END) AS fecha_fin,
            MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'empresa_asociada'
                THEN TRIM(c.valor_campo_doc) END) AS empresa_asociada,
            MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'tipo_doc_contratista'
                THEN TRIM(c.valor_campo_doc) END) AS tipo_doc_contratista,
            MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'numero_cotizacion'
                THEN TRIM(c.valor_campo_doc) END) AS numero_cotizacion
        FROM item_documentos c
        WHERE UPPER(TRIM(c.tipo_doc)) = 'CONTRATO'
        GROUP BY c.numerodoc
    ) t
    WHERE t.numero_contrato IS NOT NULL
      AND TRIM(t.numero_contrato) <> ''
      AND (
            p_constructora IS NULL OR TRIM(p_constructora) = ''
            OR LOWER(TRIM(t.constructora)) = LOWER(TRIM(p_constructora))
          )
      AND (
            p_proyecto IS NULL OR TRIM(p_proyecto) = ''
            OR LOWER(TRIM(t.proyecto)) = LOWER(TRIM(p_proyecto))
          )
    ORDER BY t.numero_contrato;
END
  `);
  console.log('OK  SP_CONSULTAR_CONTRATOS_FILTRADOS');

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
    IN p_fondo DECIMAL(18,3),
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
        amd_consecutivo, amd_numero_contrato, amd_tipo_vinculo,
        amd_item, amd_detalle, amd_cantidad, amd_unidad_medida,
        amd_ancho, amd_alto, amd_fondo, amd_observaciones,
        amd_evidencia, amd_usuario_creacion
    )
    VALUES
    (
        p_consecutivo, p_numero_contrato, v_tipo,
        p_item, p_detalle, p_cantidad, p_unidad_medida,
        p_ancho, p_alto, p_fondo, p_observaciones,
        p_evidencia, p_usuario_creacion
    );
END
  `);
  console.log('OK  sp_insertar_actas_medida_plano (con fondo)');

  await conn.end();
  console.log('=== LISTO acta-medida-fase1 ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
