-- Valida N° Documento de CONTRATO contra catálogo documento_numero antes de insertar.
-- No modifica datos; lanza error SQL si no cumple.

DROP PROCEDURE IF EXISTS SP_VALIDAR_DOCUMENTO_NUMERO_CONTRATO;

DELIMITER $$

CREATE PROCEDURE SP_VALIDAR_DOCUMENTO_NUMERO_CONTRATO(
    IN p_numero_documento VARCHAR(100),
    IN p_tipo_doc VARCHAR(50),
    IN p_constructora VARCHAR(255),
    IN p_proyecto VARCHAR(255)
)
BEGIN
    DECLARE v_id_doc INT DEFAULT NULL;
    DECLARE v_estado VARCHAR(20) DEFAULT NULL;
    DECLARE v_tipo VARCHAR(50) DEFAULT NULL;
    DECLARE v_constructora VARCHAR(255) DEFAULT NULL;
    DECLARE v_proyecto VARCHAR(255) DEFAULT NULL;
    DECLARE v_dup INT DEFAULT 0;

    IF TRIM(IFNULL(p_numero_documento, '')) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'N° Documento es obligatorio.';
    END IF;

    IF TRIM(IFNULL(p_tipo_doc, '')) = '' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Tipo documento es obligatorio.';
    END IF;

    SELECT
        D.id_documento_numero,
        D.estado,
        D.tipo_doc,
        C.nombre,
        P.nombre
    INTO
        v_id_doc,
        v_estado,
        v_tipo,
        v_constructora,
        v_proyecto
    FROM documento_numero D
    INNER JOIN constructoras C ON C.id_constructora = D.id_constructora
    INNER JOIN proyectos_constructoras P ON P.id_proyecto = D.id_proyecto
    WHERE TRIM(D.numero_documento) COLLATE utf8mb4_general_ci =
          TRIM(p_numero_documento) COLLATE utf8mb4_general_ci
    LIMIT 1;

    IF v_id_doc IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'N° Documento no existe en catálogo de administración.';
    END IF;

    IF UPPER(TRIM(IFNULL(v_estado, ''))) COLLATE utf8mb4_general_ci <>
       'ACTIVO' COLLATE utf8mb4_general_ci THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'N° Documento inactivo en catálogo.';
    END IF;

    IF UPPER(TRIM(v_tipo)) COLLATE utf8mb4_general_ci <>
       UPPER(TRIM(p_tipo_doc)) COLLATE utf8mb4_general_ci THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'N° Documento no corresponde al tipo seleccionado.';
    END IF;

    IF UPPER(TRIM(v_constructora)) COLLATE utf8mb4_general_ci <>
       UPPER(TRIM(p_constructora)) COLLATE utf8mb4_general_ci THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'N° Documento no corresponde a la constructora seleccionada.';
    END IF;

    IF UPPER(TRIM(v_proyecto)) COLLATE utf8mb4_general_ci <>
       UPPER(TRIM(p_proyecto)) COLLATE utf8mb4_general_ci THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'N° Documento no corresponde al proyecto seleccionado.';
    END IF;

    SELECT COUNT(*) INTO v_dup
    FROM item_documentos
    WHERE UPPER(TRIM(tipo_doc)) COLLATE utf8mb4_general_ci =
          'CONTRATO' COLLATE utf8mb4_general_ci
      AND LOWER(nombre_campo_doc) COLLATE utf8mb4_general_ci =
          'numero_contrato' COLLATE utf8mb4_general_ci
      AND TRIM(valor_campo_doc) COLLATE utf8mb4_general_ci =
          TRIM(p_numero_documento) COLLATE utf8mb4_general_ci;

    IF v_dup > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Ya existe un contrato con ese N° Documento.';
    END IF;

    SELECT 'OK' AS mensaje;
END$$

DELIMITER ;
