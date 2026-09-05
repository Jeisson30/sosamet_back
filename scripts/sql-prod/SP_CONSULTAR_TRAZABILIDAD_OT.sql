-- ============================================================
-- PRODUCCIÓN: SP_CONSULTAR_TRAZABILIDAD_OT
-- Trazabilidad completa de una OT (Asignar / Ejecución de Cortes)
--
-- Parámetro:
--   p_id_order_work INT  — PK de order_work
--
-- Resultsets:
--   1) Cabecera OT + cierre de ejecución (si existe)
--   2) Ítems OT con vínculo acta/plano y evidencias
--   3) Actas de medida (cabecera EAV) relacionadas a la OT
--
-- Prueba:
--   CALL SP_CONSULTAR_TRAZABILIDAD_OT(9);
--   CALL SP_CONSULTAR_TRAZABILIDAD_OT(7);
-- ============================================================

DROP PROCEDURE IF EXISTS SP_CONSULTAR_TRAZABILIDAD_OT;

DELIMITER $$

CREATE PROCEDURE SP_CONSULTAR_TRAZABILIDAD_OT(
    IN p_id_order_work INT
)
SALIR: BEGIN

    IF p_id_order_work IS NULL OR p_id_order_work <= 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'id_order_work es obligatorio.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM order_work WHERE id_order_work = p_id_order_work
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'La orden de trabajo no existe.';
    END IF;

    /* ============================================================
       RS1 — CABECERA OT + EJECUCIÓN
       ============================================================ */
    SELECT
        OW.id_order_work,
        OW.consecutivo,
        OW.ot_estado AS estado,
        OW.tipo_corte AS tipo_actividad,
        OW.fecha_entrega,
        OW.observaciones,
        OW.fecha_creacion,
        OW.fecha_actualizacion,
        OW.ot_constructora AS constructora,
        OW.ot_proyecto AS proyecto,
        OW.ot_tipo_documento AS tipo_documento,
        OW.ot_contrato AS numero_contrato,
        OW.ot_autorizo AS autorizo,
        OW.encargado_id,
        CONCAT(IFNULL(U.nombre, ''), ' ', IFNULL(U.apellido, '')) AS encargado,
        OW.empresa_asociada_id,
        E_OT.nombre_empresa AS empresa_asociada_ot,

        EC.id_ejecucion,
        EC.consecutivo AS consecutivo_ejecucion,
        EC.empresa_asociada_id AS empresa_ejecucion_id,
        E_EC.nombre_empresa AS empresa_ejecucion,
        EC.tipo_corte AS tipo_corte_ejecucion,
        EC.observaciones AS observaciones_ejecucion,
        EC.estado AS estado_ejecucion,
        EC.fecha_creacion AS fecha_creacion_ejecucion,
        EC.fecha_finalizado AS fecha_finalizado_ejecucion,

        (
            SELECT COUNT(*)
            FROM order_work_detail D0
            WHERE D0.id_order_work = OW.id_order_work
        ) AS total_items,
        (
            SELECT COUNT(*)
            FROM order_work_detail D1
            WHERE D1.id_order_work = OW.id_order_work
              AND IFNULL(D1.owd_estado, 1) = 2
        ) AS items_completados,

        (
            SELECT GROUP_CONCAT(
                DISTINCT NULLIF(TRIM(AMD0.amd_consecutivo), '')
                ORDER BY AMD0.amd_consecutivo
                SEPARATOR ', '
            )
            FROM order_work_detail D2
            LEFT JOIN actas_medida_detalle AMD0 ON AMD0.amd_id = D2.amd_id
            WHERE D2.id_order_work = OW.id_order_work
        ) AS consecutivos_acta,

        (
            SELECT GROUP_CONCAT(
                DISTINCT NULLIF(TRIM(AMD1.amd_consecutivo_item), '')
                ORDER BY AMD1.amd_consecutivo_item
                SEPARATOR ', '
            )
            FROM order_work_detail D3
            LEFT JOIN actas_medida_detalle AMD1 ON AMD1.amd_id = D3.amd_id
            WHERE D3.id_order_work = OW.id_order_work
        ) AS consecutivos_plano

    FROM order_work OW

    LEFT JOIN usuarios U
        ON U.id_usuario = OW.encargado_id

    LEFT JOIN empresa E_OT
        ON E_OT.id = OW.empresa_asociada_id

    LEFT JOIN ejecucion_corte EC
        ON EC.id_order_work = OW.id_order_work

    LEFT JOIN empresa E_EC
        ON E_EC.id = EC.empresa_asociada_id

    WHERE OW.id_order_work = p_id_order_work
    LIMIT 1;


    /* ============================================================
       RS2 — ÍTEMS + ACTA / PLANO
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
        IFNULL(D.owd_estado, 1) AS owd_estado,
        D.owd_fecha_finalizado,
        D.fecha_creacion AS fecha_creacion_item,

        AMD.amd_consecutivo AS consecutivo_acta,
        AMD.amd_consecutivo_item AS consecutivo_plano,
        AMD.amd_numero_contrato AS contrato_acta,
        AMD.amd_detalle AS detalle_acta_item,
        AMD.amd_cantidad AS cantidad_acta,
        AMD.amd_unidad_medida AS um_acta,
        AMD.amd_ancho AS ancho_acta,
        AMD.amd_alto AS alto_acta,
        AMD.amd_observaciones AS observaciones_acta_item,
        AMD.amd_evidencia AS evidencia_acta,
        AMD.amd_evidencia_item AS evidencia_plano,
        AMD.amd_fecha_enviado AS fecha_enviado_plano,
        AMD.amd_fecha_aprobado AS fecha_aprobado_plano,
        AMD.amd_estado AS estado_plano

    FROM order_work_detail D

    INNER JOIN order_work OW
        ON OW.id_order_work = D.id_order_work

    LEFT JOIN actas_medida_detalle AMD
        ON AMD.amd_id = D.amd_id

    WHERE D.id_order_work = p_id_order_work

    ORDER BY D.id_order_work_detail ASC;


    /* ============================================================
       RS3 — CABECERAS ACTA (EAV) ligadas a la OT
       ============================================================ */
    SELECT
        ACT.consecutivo_acta,
        ACT.constructora,
        ACT.proyecto,
        ACT.numero_contrato,
        ACT.estado_acta,
        ACT.fecha_acta,
        ACT.fecha_terminacion,
        ACT.tipo_documento,
        ACT.detalle_acta,
        ACT.observaciones_acta,
        ACT.despiece_material,
        ACT.acta_produccion,
        ACT.id_disenador,
        CONCAT(IFNULL(UD.nombre, ''), ' ', IFNULL(UD.apellido, '')) AS disenador,
        ACT.foto_1,
        ACT.foto_2,
        ACT.foto_3,
        (
            SELECT GROUP_CONCAT(
                DISTINCT NULLIF(TRIM(AMD2.amd_consecutivo_item), '')
                ORDER BY AMD2.amd_consecutivo_item
                SEPARATOR ', '
            )
            FROM actas_medida_detalle AMD2
            WHERE AMD2.amd_consecutivo = ACT.consecutivo_acta
              AND AMD2.amd_id IN (
                  SELECT D4.amd_id
                  FROM order_work_detail D4
                  WHERE D4.id_order_work = p_id_order_work
                    AND D4.amd_id IS NOT NULL
              )
        ) AS planos_vinculados
    FROM (
        SELECT
            ID.numerodoc AS consecutivo_acta,
            MAX(CASE WHEN ID.nombre_campo_doc = 'constructora' THEN ID.valor_campo_doc END) AS constructora,
            MAX(CASE WHEN ID.nombre_campo_doc = 'proyecto' THEN ID.valor_campo_doc END) AS proyecto,
            MAX(CASE WHEN ID.nombre_campo_doc = 'numero_contrato' THEN ID.valor_campo_doc END) AS numero_contrato,
            MAX(CASE WHEN ID.nombre_campo_doc = 'estado' THEN ID.valor_campo_doc END) AS estado_acta,
            MAX(CASE WHEN ID.nombre_campo_doc = 'am_fecha_acta' THEN ID.valor_campo_doc END) AS fecha_acta,
            MAX(CASE WHEN ID.nombre_campo_doc = 'fecha terminación' THEN ID.valor_campo_doc END) AS fecha_terminacion,
            MAX(CASE WHEN ID.nombre_campo_doc = 'am_tipo_de_doc' THEN ID.valor_campo_doc END) AS tipo_documento,
            MAX(CASE WHEN ID.nombre_campo_doc = 'am_detalle' THEN ID.valor_campo_doc END) AS detalle_acta,
            MAX(CASE WHEN ID.nombre_campo_doc = 'observaciones' THEN ID.valor_campo_doc END) AS observaciones_acta,
            MAX(CASE WHEN ID.nombre_campo_doc = 'despiece_material' THEN ID.valor_campo_doc END) AS despiece_material,
            MAX(CASE WHEN ID.nombre_campo_doc = 'acta_produccion' THEN ID.valor_campo_doc END) AS acta_produccion,
            MAX(CASE WHEN ID.nombre_campo_doc = 'am_id_disenador_encargado' THEN ID.valor_campo_doc END) AS id_disenador,
            MAX(CASE WHEN ID.nombre_campo_doc = 'fotos_1' THEN ID.valor_campo_doc END) AS foto_1,
            MAX(CASE WHEN ID.nombre_campo_doc = 'foto_2' THEN ID.valor_campo_doc END) AS foto_2,
            MAX(CASE WHEN ID.nombre_campo_doc = 'foto_3' THEN ID.valor_campo_doc END) AS foto_3
        FROM item_documentos ID
        WHERE ID.tipo_doc IN ('ACTAS DE MEDIDA', 'Actas')
          AND ID.numerodoc IN (
              SELECT DISTINCT AMD3.amd_consecutivo
              FROM order_work_detail D5
              INNER JOIN actas_medida_detalle AMD3 ON AMD3.amd_id = D5.amd_id
              WHERE D5.id_order_work = p_id_order_work
                AND AMD3.amd_consecutivo IS NOT NULL
                AND TRIM(AMD3.amd_consecutivo) <> ''
          )
        GROUP BY ID.numerodoc
    ) ACT

    LEFT JOIN usuarios UD
        ON UD.id_usuario = CAST(NULLIF(TRIM(ACT.id_disenador), '') AS UNSIGNED)

    ORDER BY ACT.consecutivo_acta;

END$$

DELIMITER ;
