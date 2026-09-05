-- SPs Ejecución de Cortes (Workbench)
-- Prefijo: ejecutar primero EJECUCION_CORTES.sql (tablas/columnas) o install-ejecucion-cortes.js

DROP PROCEDURE IF EXISTS SP_FINALIZAR_EJECUCION_CORTE;
DROP PROCEDURE IF EXISTS SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION;

DELIMITER $$

CREATE PROCEDURE SP_FINALIZAR_EJECUCION_CORTE(
    IN p_id_order_work INT,
    IN p_empresa_asociada_id INT,
    IN p_encargado_id INT,
    IN p_tipo_corte VARCHAR(50),
    IN p_observaciones TEXT,
    IN p_usuario_id INT,
    IN p_items_esperados INT,
    IN p_consecutivo VARCHAR(50)
)
BEGIN
    DECLARE vExiste INT DEFAULT 0;
    DECLARE vEstadoOt TINYINT DEFAULT 0;
    DECLARE vTotalItems INT DEFAULT 0;
    DECLARE vPendientes INT DEFAULT 0;
    DECLARE vYaEjecutada INT DEFAULT 0;
    DECLARE vIdEjecucion INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_id_order_work IS NULL OR p_id_order_work <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'id_order_work es obligatorio.';
    END IF;

    IF p_empresa_asociada_id IS NULL OR p_empresa_asociada_id <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'empresa_asociada_id es obligatoria.';
    END IF;

    IF p_encargado_id IS NULL OR p_encargado_id <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'encargado_id es obligatorio.';
    END IF;

    IF p_tipo_corte IS NULL OR TRIM(p_tipo_corte) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tipo_corte es obligatorio.';
    END IF;

    IF p_consecutivo IS NULL OR TRIM(p_consecutivo) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'consecutivo de ejecución es obligatorio.';
    END IF;

    SELECT COUNT(*), IFNULL(MAX(ot_estado), 0)
      INTO vExiste, vEstadoOt
    FROM order_work
    WHERE id_order_work = p_id_order_work;

    IF vExiste = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La orden de trabajo no existe.';
    END IF;

    IF vEstadoOt = 3 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se puede finalizar una OT anulada.';
    END IF;

    IF vEstadoOt = 2 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La orden de trabajo ya fue finalizada en ejecución.';
    END IF;

    SELECT COUNT(*) INTO vYaEjecutada
    FROM ejecucion_corte
    WHERE id_order_work = p_id_order_work;

    IF vYaEjecutada > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ya existe una ejecución finalizada para esta OT.';
    END IF;

    SELECT COUNT(*) INTO vTotalItems
    FROM order_work_detail
    WHERE id_order_work = p_id_order_work;

    IF vTotalItems = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La OT no tiene ítems para finalizar.';
    END IF;

    IF p_items_esperados IS NULL OR p_items_esperados <> vTotalItems THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Debe marcar todos los ítems de la OT antes de finalizar.';
    END IF;

    START TRANSACTION;

    UPDATE order_work_detail
       SET owd_estado = 2,
           owd_fecha_finalizado = IFNULL(owd_fecha_finalizado, NOW())
     WHERE id_order_work = p_id_order_work;

    SELECT COUNT(*) INTO vPendientes
    FROM order_work_detail
    WHERE id_order_work = p_id_order_work
      AND IFNULL(owd_estado, 1) <> 2;

    IF vPendientes > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Quedan ítems pendientes; no se puede finalizar.';
    END IF;

    INSERT INTO ejecucion_corte (
        consecutivo, id_order_work, empresa_asociada_id, encargado_id,
        tipo_corte, observaciones, estado, fecha_creacion, fecha_finalizado, usuario_creacion
    ) VALUES (
        p_consecutivo, p_id_order_work, p_empresa_asociada_id, p_encargado_id,
        p_tipo_corte, p_observaciones, 2, NOW(), NOW(), p_usuario_id
    );

    SET vIdEjecucion = LAST_INSERT_ID();

    -- No actualizar empresa_asociada_id en order_work:
    -- la empresa de ejecución vive en ejecucion_corte.
    -- Varias OT pueden compartir consecutivo con empresa NULL (uk permite NULL),
    -- y al setear empresa aquí chocaba uk_consecutivo_empresa (ej. OT-0002 + empresa 1).
    UPDATE order_work
       SET ot_estado = 2,
           fecha_actualizacion = NOW(),
           tipo_corte = IFNULL(p_tipo_corte, tipo_corte),
           observaciones = IFNULL(p_observaciones, observaciones)
     WHERE id_order_work = p_id_order_work;

    COMMIT;

    SELECT
        1 AS Codigo,
        'Ejecución finalizada correctamente.' AS Mensaje,
        vIdEjecucion AS id_ejecucion,
        p_consecutivo AS consecutivo,
        p_id_order_work AS id_order_work,
        2 AS estado;
END$$

CREATE PROCEDURE SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION(
    IN p_encargado_id INT,
    IN p_buscar VARCHAR(150)
)
BEGIN
    DECLARE v_buscar VARCHAR(150)
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

    SET v_buscar = CONVERT(IFNULL(p_buscar, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci;

    -- UNION OT + ADICIONAL con collation unificada (evita Illegal mix of collations)
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
END$$

DELIMITER ;
