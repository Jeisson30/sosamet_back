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

  await c.query('DROP PROCEDURE IF EXISTS SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION');

  await c.query(`
CREATE PROCEDURE SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION(
    IN p_encargado_id INT,
    IN p_buscar VARCHAR(150)
)
BEGIN
    DECLARE v_buscar VARCHAR(150)
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    SET v_buscar = CONVERT(IFNULL(p_buscar, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci;

    SELECT * FROM (
      SELECT
          D.id_order_work_detail,
          D.id_order_work,
          CONVERT(OW.consecutivo USING utf8mb4) COLLATE utf8mb4_unicode_ci AS orden_trabajo,
          CONVERT(IFNULL(OW.ot_proyecto, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS proyecto,
          CONVERT(IFNULL(OW.ot_contrato, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS contrato_no,
          OW.fecha_creacion AS fecha_inicio,
          IFNULL(D.owd_fecha_finalizado, EC.fecha_finalizado) AS fecha_finalizado,
          CONVERT(IFNULL(D.item, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS item,
          CONVERT(IFNULL(D.descripcion, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS descripcion,
          D.cantidad,
          CONVERT(IFNULL(D.um, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS um,
          D.ancho,
          D.alto,
          D.owd_estado AS estado,
          EC.id_ejecucion,
          CONVERT(IFNULL(EC.consecutivo, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS consecutivo_ejecucion,
          EC.empresa_asociada_id,
          CONVERT(IFNULL(E.nombre_empresa, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS empresa_asociada,
          CONVERT(IFNULL(EC.tipo_corte, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS tipo_corte,
          OW.encargado_id,
          CONVERT(CONCAT(IFNULL(U.nombre, ''), ' ', IFNULL(U.apellido, '')) USING utf8mb4)
            COLLATE utf8mb4_unicode_ci AS encargado,
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
          CONVERT(IFNULL(A.orden_no, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS orden_trabajo,
          CONVERT(IFNULL(A.proyecto, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS proyecto,
          CONVERT(IFNULL(A.contrato_no, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS contrato_no,
          A.fecha_creacion AS fecha_inicio,
          A.adc_fecha_finalizado AS fecha_finalizado,
          CONVERT(IFNULL(A.item, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS item,
          CONVERT(IFNULL(A.descripcion, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS descripcion,
          A.cantidad,
          CONVERT(IFNULL(A.um, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS um,
          A.ancho,
          A.alto,
          A.adc_estado AS estado,
          A.id_ejecucion,
          CAST('' AS CHAR(50) CHARSET utf8mb4) COLLATE utf8mb4_unicode_ci AS consecutivo_ejecucion,
          A.empresa_id AS empresa_asociada_id,
          CONVERT(IFNULL(EMP.nombre_empresa, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS empresa_asociada,
          CONVERT(IFNULL(A.tipo_actividad, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS tipo_corte,
          A.usuario_id AS encargado_id,
          CONVERT(CONCAT(IFNULL(U2.nombre, ''), ' ', IFNULL(U2.apellido, '')) USING utf8mb4)
            COLLATE utf8mb4_unicode_ci AS encargado,
          CONVERT('ADICIONAL' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS origen,
          A.id_adicional,
          CONVERT(IFNULL(A.tipo_actividad, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS tipo_actividad
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

  const [rows] = await c.query('CALL SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION(?, ?)', [
    0,
    '',
  ]);
  const items = rows[0] || [];
  console.log('OK SP. items:', items.length);
  if (items.length) {
    console.log(items.slice(0, 3).map((r) => ({
      origen: r.origen,
      orden: r.orden_trabajo,
      item: r.item,
      id_ow: r.id_order_work,
    })));
  }

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
