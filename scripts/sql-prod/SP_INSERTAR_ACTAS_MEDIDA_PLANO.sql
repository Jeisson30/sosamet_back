-- sp_insertar_actas_medida_plano — incluye tipo_vinculo y amd_fondo
-- Requiere: amd_tipo_vinculo (ALTER_tipo_vinculo_cotizacion.sql)
--           amd_fondo (ALTER_amd_fondo.sql)

DROP PROCEDURE IF EXISTS sp_insertar_actas_medida_plano;

DELIMITER $$

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
        amd_consecutivo,
        amd_numero_contrato,
        amd_tipo_vinculo,
        amd_item,
        amd_detalle,
        amd_cantidad,
        amd_unidad_medida,
        amd_ancho,
        amd_alto,
        amd_fondo,
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
        p_fondo,
        p_observaciones,
        p_evidencia,
        p_usuario_creacion
    );
END$$

DELIMITER ;
