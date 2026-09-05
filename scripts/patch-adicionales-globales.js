/**
 * Adicionales globales por usuario:
 * - usuario_id, empresa_id, tipo_actividad
 * - id_order_work nullable
 * - SP consulta por usuario
 * - SP completados incluye adicionales (origen=ADICIONAL)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const mysql = require('mysql2/promise');

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function ensureColumn(conn, table, column, ddl) {
  if (await columnExists(conn, table, column)) {
    console.log(`= ${table}.${column}`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ${ddl}`);
  console.log(`+ ${table}.${column}`);
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  try {
    await conn.query(`
      ALTER TABLE ejecucion_corte_adicional
        MODIFY COLUMN id_order_work INT NULL
    `);
    console.log('~ id_order_work NULL');

    await ensureColumn(
      conn,
      'ejecucion_corte_adicional',
      'usuario_id',
      `ADD COLUMN usuario_id INT NULL COMMENT 'Dueño del adicional' AFTER id_order_work`
    );
    await ensureColumn(
      conn,
      'ejecucion_corte_adicional',
      'empresa_id',
      `ADD COLUMN empresa_id INT NULL COMMENT 'Empresa del adicional' AFTER usuario_id`
    );
    await ensureColumn(
      conn,
      'ejecucion_corte_adicional',
      'tipo_actividad',
      `ADD COLUMN tipo_actividad VARCHAR(50) NULL COMMENT 'PINTURA|FABRICACIÓN|INSTALACIÓN' AFTER empresa_id`
    );

    await conn.query(`DROP PROCEDURE IF EXISTS SP_CONSULTAR_ACTIVIDADES_ADICIONALES_USUARIO`);
    await conn.query(`
CREATE PROCEDURE SP_CONSULTAR_ACTIVIDADES_ADICIONALES_USUARIO(
    IN p_usuario_id INT,
    IN p_solo_pendientes TINYINT
)
BEGIN
    SELECT
        A.id_adicional,
        A.id_ejecucion,
        A.id_order_work,
        A.usuario_id,
        A.empresa_id,
        E.nombre_empresa AS empresa_nombre,
        A.tipo_actividad,
        A.item,
        A.contrato_no,
        A.proyecto,
        A.descripcion,
        A.cantidad,
        A.um,
        A.ancho,
        A.alto,
        A.acta_medida_no,
        A.orden_no,
        A.plano_no,
        A.observaciones,
        A.adc_estado,
        A.adc_fecha_finalizado,
        A.fecha_creacion
    FROM ejecucion_corte_adicional A
    LEFT JOIN empresa E ON E.id = A.empresa_id
    WHERE A.usuario_id = p_usuario_id
      AND (
            IFNULL(p_solo_pendientes, 0) = 0
            OR IFNULL(A.adc_estado, 1) <> 2
          )
    ORDER BY A.id_adicional ASC;
END
    `);
    console.log('+ SP_CONSULTAR_ACTIVIDADES_ADICIONALES_USUARIO');

    await conn.query(`DROP PROCEDURE IF EXISTS SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION`);
    await conn.query(`
CREATE PROCEDURE SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION(
    IN p_encargado_id INT,
    IN p_buscar VARCHAR(150)
)
BEGIN
    DECLARE v_buscar VARCHAR(150)
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    SET v_buscar = CONVERT(IFNULL(p_buscar, '') USING utf8mb4);

    SELECT * FROM (
      SELECT
          D.id_order_work_detail,
          D.id_order_work,
          OW.consecutivo AS orden_trabajo,
          OW.ot_proyecto AS proyecto,
          OW.ot_contrato AS contrato_no,
          OW.fecha_creacion AS fecha_inicio,
          IFNULL(D.owd_fecha_finalizado, EC.fecha_finalizado) AS fecha_finalizado,
          D.item,
          D.descripcion,
          D.cantidad,
          D.um,
          D.ancho,
          D.alto,
          D.owd_estado AS estado,
          EC.id_ejecucion,
          EC.consecutivo AS consecutivo_ejecucion,
          EC.empresa_asociada_id,
          E.nombre_empresa AS empresa_asociada,
          EC.tipo_corte,
          OW.encargado_id,
          CONCAT(IFNULL(U.nombre, ''), ' ', IFNULL(U.apellido, '')) AS encargado,
          CONVERT('OT' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS origen,
          CAST(NULL AS SIGNED) AS id_adicional,
          CAST(NULL AS CHAR(50) CHARSET utf8mb4) COLLATE utf8mb4_unicode_ci AS tipo_actividad
      FROM order_work_detail D
      INNER JOIN order_work OW ON OW.id_order_work = D.id_order_work
      LEFT JOIN ejecucion_corte EC ON EC.id_order_work = OW.id_order_work
      LEFT JOIN empresa E ON E.id = EC.empresa_asociada_id
      LEFT JOIN usuarios U ON U.id_usuario = OW.encargado_id
      WHERE D.owd_estado = 2
        AND IFNULL(OW.ot_estado, 0) <> 3
        AND (
              p_encargado_id IS NULL OR p_encargado_id = 0
              OR OW.encargado_id = p_encargado_id
        )
        AND (
              v_buscar IS NULL OR TRIM(v_buscar) = ''
              OR CONVERT(OW.consecutivo USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LIKE CONCAT('%', v_buscar, '%')
              OR CONVERT(IFNULL(OW.ot_proyecto, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LIKE CONCAT('%', v_buscar, '%')
              OR CONVERT(IFNULL(OW.ot_contrato, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LIKE CONCAT('%', v_buscar, '%')
              OR CONVERT(IFNULL(D.item, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LIKE CONCAT('%', v_buscar, '%')
              OR CONVERT(IFNULL(EC.consecutivo, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LIKE CONCAT('%', v_buscar, '%')
        )

      UNION ALL

      SELECT
          CAST(NULL AS SIGNED) AS id_order_work_detail,
          A.id_order_work,
          A.orden_no AS orden_trabajo,
          A.proyecto,
          A.contrato_no,
          A.fecha_creacion AS fecha_inicio,
          A.adc_fecha_finalizado AS fecha_finalizado,
          A.item,
          A.descripcion,
          A.cantidad,
          A.um,
          A.ancho,
          A.alto,
          A.adc_estado AS estado,
          A.id_ejecucion,
          CAST(NULL AS CHAR(50) CHARSET utf8mb4) COLLATE utf8mb4_unicode_ci AS consecutivo_ejecucion,
          A.empresa_id AS empresa_asociada_id,
          EMP.nombre_empresa AS empresa_asociada,
          A.tipo_actividad AS tipo_corte,
          A.usuario_id AS encargado_id,
          CONCAT(IFNULL(U2.nombre, ''), ' ', IFNULL(U2.apellido, '')) AS encargado,
          CONVERT('ADICIONAL' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS origen,
          A.id_adicional,
          A.tipo_actividad
      FROM ejecucion_corte_adicional A
      LEFT JOIN empresa EMP ON EMP.id = A.empresa_id
      LEFT JOIN usuarios U2 ON U2.id_usuario = A.usuario_id
      WHERE IFNULL(A.adc_estado, 1) = 2
        AND (
              p_encargado_id IS NULL OR p_encargado_id = 0
              OR A.usuario_id = p_encargado_id
        )
        AND (
              v_buscar IS NULL OR TRIM(v_buscar) = ''
              OR CONVERT(IFNULL(A.orden_no, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LIKE CONCAT('%', v_buscar, '%')
              OR CONVERT(IFNULL(A.proyecto, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LIKE CONCAT('%', v_buscar, '%')
              OR CONVERT(IFNULL(A.contrato_no, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LIKE CONCAT('%', v_buscar, '%')
              OR CONVERT(IFNULL(A.item, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LIKE CONCAT('%', v_buscar, '%')
              OR CONVERT(IFNULL(A.tipo_actividad, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  LIKE CONCAT('%', v_buscar, '%')
        )
    ) X
    ORDER BY X.fecha_finalizado DESC, X.id_order_work_detail DESC, X.id_adicional DESC;
END
    `);
    console.log('+ SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION (OT + ADICIONAL)');
    console.log('OK');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
