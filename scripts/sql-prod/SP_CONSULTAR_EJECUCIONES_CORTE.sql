-- ============================================================
-- PRODUCCIÓN: Consulta / mantención Ejecución de Cortes
-- ============================================================

DROP PROCEDURE IF EXISTS SP_CONSULTAR_EJECUCIONES_CORTE;
DROP PROCEDURE IF EXISTS SP_ACTUALIZAR_EJECUCION_CORTE;
DROP PROCEDURE IF EXISTS SP_ANULAR_EJECUCION_CORTE;
DROP PROCEDURE IF EXISTS SP_ELIMINAR_EJECUCION_CORTE;

DELIMITER $$

CREATE PROCEDURE SP_CONSULTAR_EJECUCIONES_CORTE(
    IN p_buscar         VARCHAR(150),
    IN p_encargado_id   INT,
    IN p_fecha_desde    DATE,
    IN p_fecha_hasta    DATE
)
BEGIN
    DECLARE v_buscar VARCHAR(150)
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    SET v_buscar = CONVERT(IFNULL(TRIM(p_buscar), '') USING utf8mb4)
        COLLATE utf8mb4_unicode_ci;

    SELECT
        EC.id_ejecucion,
        CONVERT(EC.consecutivo USING utf8mb4) COLLATE utf8mb4_unicode_ci AS consecutivo_corte,
        EC.id_order_work,
        CONVERT(OW.consecutivo USING utf8mb4) COLLATE utf8mb4_unicode_ci AS consecutivo_ot,
        EC.encargado_id,
        CONVERT(CONCAT(IFNULL(U.nombre, ''), ' ', IFNULL(U.apellido, '')) USING utf8mb4)
            COLLATE utf8mb4_unicode_ci AS encargado,
        CONVERT(IFNULL(EC.tipo_corte, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS tipo_corte,
        EC.empresa_asociada_id,
        CONVERT(IFNULL(E.nombre_empresa, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS empresa_asociada,
        CONVERT(IFNULL(EC.observaciones, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS observaciones,
        EC.estado,
        CONVERT(
            CASE EC.estado
                WHEN 2 THEN 'Completado'
                WHEN 3 THEN 'Anulado'
                ELSE 'Pendiente'
            END USING utf8mb4
        ) COLLATE utf8mb4_unicode_ci AS estado_label,
        EC.fecha_creacion,
        EC.fecha_finalizado AS fecha_terminada,
        CONVERT(IFNULL(OW.ot_constructora, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS constructora,
        CONVERT(IFNULL(OW.ot_proyecto, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS proyecto,
        CONVERT(IFNULL(OW.ot_contrato, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS numero_contrato,
        CONVERT('EJECUCION' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS origen
    FROM ejecucion_corte EC
    INNER JOIN order_work OW ON OW.id_order_work = EC.id_order_work
    LEFT JOIN usuarios U ON U.id_usuario = EC.encargado_id
    LEFT JOIN empresa E ON E.id = EC.empresa_asociada_id
    WHERE
        (
            v_buscar = ''
            OR CONVERT(EC.consecutivo USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(OW.consecutivo USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(IFNULL(EC.tipo_corte, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(IFNULL(OW.ot_constructora, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(IFNULL(OW.ot_proyecto, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(IFNULL(OW.ot_contrato, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(
                CONCAT(IFNULL(U.nombre, ''), ' ', IFNULL(U.apellido, ''))
                USING utf8mb4
              ) COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', v_buscar, '%')
        )
        AND (
            p_encargado_id IS NULL OR p_encargado_id = 0
            OR EC.encargado_id = p_encargado_id
        )
        AND (
            p_fecha_desde IS NULL
            OR DATE(IFNULL(EC.fecha_finalizado, EC.fecha_creacion)) >= p_fecha_desde
        )
        AND (
            p_fecha_hasta IS NULL
            OR DATE(IFNULL(EC.fecha_finalizado, EC.fecha_creacion)) <= p_fecha_hasta
        )

    UNION ALL

    SELECT
        CAST(NULL AS SIGNED) AS id_ejecucion,
        CONVERT(NULL USING utf8mb4) COLLATE utf8mb4_unicode_ci AS consecutivo_corte,
        OW.id_order_work,
        CONVERT(OW.consecutivo USING utf8mb4) COLLATE utf8mb4_unicode_ci AS consecutivo_ot,
        OW.encargado_id,
        CONVERT(CONCAT(IFNULL(U.nombre, ''), ' ', IFNULL(U.apellido, '')) USING utf8mb4)
            COLLATE utf8mb4_unicode_ci AS encargado,
        CONVERT(IFNULL(OW.tipo_corte, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS tipo_corte,
        OW.empresa_asociada_id,
        CONVERT(IFNULL(E.nombre_empresa, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS empresa_asociada,
        CONVERT(IFNULL(OW.observaciones, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS observaciones,
        1 AS estado,
        CONVERT('Pendiente' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS estado_label,
        OW.fecha_creacion,
        CAST(NULL AS DATETIME) AS fecha_terminada,
        CONVERT(IFNULL(OW.ot_constructora, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS constructora,
        CONVERT(IFNULL(OW.ot_proyecto, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS proyecto,
        CONVERT(IFNULL(OW.ot_contrato, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS numero_contrato,
        CONVERT('OT' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS origen
    FROM order_work OW
    LEFT JOIN usuarios U ON U.id_usuario = OW.encargado_id
    LEFT JOIN empresa E ON E.id = OW.empresa_asociada_id
    WHERE OW.ot_estado = 1
      AND NOT EXISTS (
          SELECT 1 FROM ejecucion_corte EC2
          WHERE EC2.id_order_work = OW.id_order_work
      )
      AND (
            v_buscar = ''
            OR CONVERT(OW.consecutivo USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(IFNULL(OW.tipo_corte, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(IFNULL(OW.ot_constructora, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(IFNULL(OW.ot_proyecto, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(IFNULL(OW.ot_contrato, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci
                LIKE CONCAT('%', v_buscar, '%')
            OR CONVERT(
                CONCAT(IFNULL(U.nombre, ''), ' ', IFNULL(U.apellido, ''))
                USING utf8mb4
              ) COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', v_buscar, '%')
      )
      AND (
            p_encargado_id IS NULL OR p_encargado_id = 0
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

    ORDER BY
        IFNULL(fecha_terminada, fecha_creacion) DESC,
        id_order_work DESC;
END$$

CREATE PROCEDURE SP_ACTUALIZAR_EJECUCION_CORTE(
    IN p_id_ejecucion INT,
    IN p_empresa_asociada_id INT,
    IN p_encargado_id INT,
    IN p_tipo_corte VARCHAR(50),
    IN p_observaciones TEXT
)
BEGIN
    DECLARE vEstado TINYINT DEFAULT 0;

    IF p_id_ejecucion IS NULL OR p_id_ejecucion <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'id_ejecucion es obligatorio.';
    END IF;

    SELECT estado INTO vEstado
    FROM ejecucion_corte
    WHERE id_ejecucion = p_id_ejecucion
    LIMIT 1;

    IF vEstado IS NULL OR vEstado = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La ejecucion no existe.';
    END IF;

    IF vEstado = 3 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se puede editar una ejecucion anulada.';
    END IF;

    IF p_tipo_corte IS NULL OR TRIM(p_tipo_corte) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tipo_corte es obligatorio.';
    END IF;

    IF p_empresa_asociada_id IS NULL OR p_empresa_asociada_id <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'empresa_asociada_id es obligatoria.';
    END IF;

    IF p_encargado_id IS NULL OR p_encargado_id <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'encargado_id es obligatorio.';
    END IF;

    UPDATE ejecucion_corte
    SET empresa_asociada_id = p_empresa_asociada_id,
        encargado_id = p_encargado_id,
        tipo_corte = UPPER(TRIM(p_tipo_corte)),
        observaciones = p_observaciones
    WHERE id_ejecucion = p_id_ejecucion;

    SELECT
        1 AS Codigo,
        'Ejecucion actualizada correctamente.' AS Mensaje,
        p_id_ejecucion AS id_ejecucion;
END$$

CREATE PROCEDURE SP_ANULAR_EJECUCION_CORTE(
    IN p_id_ejecucion INT
)
BEGIN
    DECLARE vEstado TINYINT DEFAULT 0;

    IF p_id_ejecucion IS NULL OR p_id_ejecucion <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'id_ejecucion es obligatorio.';
    END IF;

    SELECT estado INTO vEstado
    FROM ejecucion_corte
    WHERE id_ejecucion = p_id_ejecucion
    LIMIT 1;

    IF vEstado IS NULL OR vEstado = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La ejecucion no existe.';
    END IF;

    IF vEstado = 3 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La ejecucion ya esta anulada.';
    END IF;

    UPDATE ejecucion_corte
    SET estado = 3
    WHERE id_ejecucion = p_id_ejecucion;

    SELECT
        1 AS Codigo,
        'Ejecucion anulada correctamente.' AS Mensaje,
        p_id_ejecucion AS id_ejecucion,
        3 AS estado;
END$$

CREATE PROCEDURE SP_ELIMINAR_EJECUCION_CORTE(
    IN p_id_ejecucion INT
)
BEGIN
    DECLARE vIdOt INT DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_id_ejecucion IS NULL OR p_id_ejecucion <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'id_ejecucion es obligatorio.';
    END IF;

    SELECT id_order_work INTO vIdOt
    FROM ejecucion_corte
    WHERE id_ejecucion = p_id_ejecucion
    LIMIT 1;

    IF vIdOt IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La ejecucion no existe.';
    END IF;

    START TRANSACTION;

    UPDATE ejecucion_corte_adicional
    SET id_ejecucion = NULL
    WHERE id_ejecucion = p_id_ejecucion;

    DELETE FROM ejecucion_corte
    WHERE id_ejecucion = p_id_ejecucion;

    UPDATE order_work_detail
    SET owd_estado = 1,
        owd_fecha_finalizado = NULL
    WHERE id_order_work = vIdOt;

    UPDATE order_work
    SET ot_estado = 1
    WHERE id_order_work = vIdOt;

    COMMIT;

    SELECT
        1 AS Codigo,
        'Ejecucion eliminada. La OT quedo pendiente nuevamente.' AS Mensaje,
        p_id_ejecucion AS id_ejecucion,
        vIdOt AS id_order_work;
END$$

DELIMITER ;
