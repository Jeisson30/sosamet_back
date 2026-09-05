/**
 * Instala SP_CONSULTAR_ORDENES_TRABAJO en la BD local (.env).
 * Uso: node scripts/install-sp-consultar-ordenes-trabajo.js
 */
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config({ override: true });

const SQL = `
DROP PROCEDURE IF EXISTS SP_CONSULTAR_ORDENES_TRABAJO;

CREATE PROCEDURE SP_CONSULTAR_ORDENES_TRABAJO(
    IN p_buscar         VARCHAR(150),
    IN p_encargado_id   INT,
    IN p_fecha_desde    DATE,
    IN p_fecha_hasta    DATE,
    IN p_constructora   VARCHAR(150),
    IN p_proyecto       VARCHAR(150),
    IN p_contrato       VARCHAR(150)
)
SALIR: BEGIN

    /* ============================================================
       RESULTSET 1 — CABECERA DE ÓRDENES DE TRABAJO
       ============================================================ */

    SELECT
        OW.id_order_work,
        OW.consecutivo,
        OW.empresa_asociada_id,
        E.nombre_empresa AS empresa_asociada,
        OW.encargado_id,
        CONCAT(IFNULL(U.nombre, ''), ' ', IFNULL(U.apellido, '')) AS encargado,
        OW.fecha_entrega,
        OW.observaciones,
        OW.tipo_corte AS tipo_actividad,
        OW.fecha_creacion,
        OW.fecha_actualizacion,
        OW.ot_constructora AS constructora,
        OW.ot_proyecto AS proyecto,
        OW.ot_tipo_documento AS tipo_documento,
        OW.ot_contrato AS numero_contrato,
        OW.ot_autorizo AS autorizo,
        OW.ot_estado AS estado,

        COUNT(DISTINCT D.id_order_work_detail) AS total_items,

        GROUP_CONCAT(
            DISTINCT NULLIF(TRIM(AMD.amd_consecutivo), '')
            ORDER BY AMD.amd_consecutivo
            SEPARATOR ', '
        ) AS consecutivos_acta,

        GROUP_CONCAT(
            DISTINCT NULLIF(TRIM(AMD.amd_consecutivo_item), '')
            ORDER BY AMD.amd_consecutivo_item
            SEPARATOR ', '
        ) AS consecutivos_plano

    FROM order_work OW

    LEFT JOIN usuarios U
        ON U.id_usuario = OW.encargado_id

    LEFT JOIN empresa E
        ON E.id = OW.empresa_asociada_id

    LEFT JOIN order_work_detail D
        ON D.id_order_work = OW.id_order_work

    LEFT JOIN actas_medida_detalle AMD
        ON AMD.amd_id = D.amd_id

    WHERE
        /* Buscar: consecutivo OT, autorizo, obs, tipo, contrato/obra, ref/plano/acta */
        (
            p_buscar IS NULL
            OR TRIM(p_buscar) = ''
            OR OW.consecutivo LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.ot_autorizo, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.observaciones, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.tipo_corte, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.ot_constructora, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.ot_proyecto, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.ot_contrato, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(D.ref, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(D.item, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(AMD.amd_consecutivo, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(AMD.amd_consecutivo_item, '') LIKE CONCAT('%', p_buscar, '%')
            OR CONCAT(IFNULL(U.nombre, ''), ' ', IFNULL(U.apellido, ''))
                LIKE CONCAT('%', p_buscar, '%')
        )

        AND (
            p_encargado_id IS NULL
            OR p_encargado_id = 0
            OR OW.encargado_id = p_encargado_id
        )

        AND (
            p_fecha_desde IS NULL
            OR DATE(OW.fecha_creacion) >= p_fecha_desde
        )

        AND (
            p_fecha_hasta IS NULL
            OR DATE(OW.fecha_creacion) <= p_fecha_hasta
        )

        AND (
            p_constructora IS NULL
            OR TRIM(p_constructora) = ''
            OR IFNULL(OW.ot_constructora, '') LIKE CONCAT('%', p_constructora, '%')
        )

        AND (
            p_proyecto IS NULL
            OR TRIM(p_proyecto) = ''
            OR IFNULL(OW.ot_proyecto, '') LIKE CONCAT('%', p_proyecto, '%')
        )

        AND (
            p_contrato IS NULL
            OR TRIM(p_contrato) = ''
            OR IFNULL(OW.ot_contrato, '') LIKE CONCAT('%', p_contrato, '%')
        )

    GROUP BY
        OW.id_order_work,
        OW.consecutivo,
        OW.empresa_asociada_id,
        E.nombre_empresa,
        OW.encargado_id,
        U.nombre,
        U.apellido,
        OW.fecha_entrega,
        OW.observaciones,
        OW.tipo_corte,
        OW.fecha_creacion,
        OW.fecha_actualizacion,
        OW.ot_constructora,
        OW.ot_proyecto,
        OW.ot_tipo_documento,
        OW.ot_contrato,
        OW.ot_autorizo,
        OW.ot_estado

    ORDER BY
        OW.fecha_creacion DESC,
        OW.id_order_work DESC;


    /* ============================================================
       RESULTSET 2 — DETALLE / ÍTEMS
       (mismas OT filtradas + datos de acta/plano si hay amd_id)
       ============================================================ */

    SELECT
        D.id_order_work_detail,
        D.id_order_work,
        OW.consecutivo AS consecutivo_orden,
        D.amd_id,
        D.ref,
        D.item,
        D.descripcion,
        D.cantidad,
        D.um,
        D.ancho,
        D.alto,
        D.observaciones AS observaciones_item,
        D.owd_estado,
        D.owd_fecha_finalizado,
        D.fecha_creacion AS fecha_creacion_item,

        AMD.amd_consecutivo AS consecutivo_acta,
        AMD.amd_consecutivo_item AS consecutivo_plano,
        AMD.amd_numero_contrato AS contrato_acta,
        AMD.amd_evidencia AS evidencia_acta,
        AMD.amd_evidencia_item AS evidencia_plano,
        AMD.amd_fecha_enviado AS fecha_enviado_plano,
        AMD.amd_fecha_aprobado AS fecha_aprobado_plano,
        AMD.amd_estado AS estado_plano

    FROM order_work_detail D

    INNER JOIN order_work OW
        ON OW.id_order_work = D.id_order_work

    LEFT JOIN usuarios U
        ON U.id_usuario = OW.encargado_id

    LEFT JOIN actas_medida_detalle AMD
        ON AMD.amd_id = D.amd_id

    WHERE
        (
            p_buscar IS NULL
            OR TRIM(p_buscar) = ''
            OR OW.consecutivo LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.ot_autorizo, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.observaciones, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.tipo_corte, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.ot_constructora, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.ot_proyecto, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.ot_contrato, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(D.ref, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(D.item, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(AMD.amd_consecutivo, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(AMD.amd_consecutivo_item, '') LIKE CONCAT('%', p_buscar, '%')
            OR CONCAT(IFNULL(U.nombre, ''), ' ', IFNULL(U.apellido, ''))
                LIKE CONCAT('%', p_buscar, '%')
        )

        AND (
            p_encargado_id IS NULL
            OR p_encargado_id = 0
            OR OW.encargado_id = p_encargado_id
        )

        AND (
            p_fecha_desde IS NULL
            OR DATE(OW.fecha_creacion) >= p_fecha_desde
        )

        AND (
            p_fecha_hasta IS NULL
            OR DATE(OW.fecha_creacion) <= p_fecha_hasta
        )

        AND (
            p_constructora IS NULL
            OR TRIM(p_constructora) = ''
            OR IFNULL(OW.ot_constructora, '') LIKE CONCAT('%', p_constructora, '%')
        )

        AND (
            p_proyecto IS NULL
            OR TRIM(p_proyecto) = ''
            OR IFNULL(OW.ot_proyecto, '') LIKE CONCAT('%', p_proyecto, '%')
        )

        AND (
            p_contrato IS NULL
            OR TRIM(p_contrato) = ''
            OR IFNULL(OW.ot_contrato, '') LIKE CONCAT('%', p_contrato, '%')
        )

    ORDER BY
        OW.id_order_work DESC,
        D.id_order_work_detail ASC;

END
`;

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  try {
    await conn.query(SQL);
    console.log('OK: SP_CONSULTAR_ORDENES_TRABAJO instalado.');
  } catch (err) {
    console.error('ERROR instalando SP:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
