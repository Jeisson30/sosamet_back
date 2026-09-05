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

    SET v_buscar = CONVERT(IFNULL(p_buscar, '') USING utf8mb4);

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
        CONCAT(IFNULL(U.nombre,''), ' ', IFNULL(U.apellido,'')) AS encargado
    FROM order_work_detail D
    INNER JOIN order_work OW
        ON OW.id_order_work = D.id_order_work
    LEFT JOIN ejecucion_corte EC
        ON EC.id_order_work = OW.id_order_work
    LEFT JOIN empresa E
        ON E.id = EC.empresa_asociada_id
    LEFT JOIN usuarios U
        ON U.id_usuario = OW.encargado_id
    WHERE D.owd_estado = 2
      AND IFNULL(OW.ot_estado, 0) <> 3
      AND (
            p_encargado_id IS NULL
            OR p_encargado_id = 0
            OR OW.encargado_id = p_encargado_id
      )
      AND (
            v_buscar IS NULL
            OR TRIM(v_buscar) = ''
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
    ORDER BY IFNULL(D.owd_fecha_finalizado, EC.fecha_finalizado) DESC,
             D.id_order_work_detail DESC;
END
  `);

  console.log('OK: SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION (collation fix)');
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
