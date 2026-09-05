-- Contratos (cabecera EAV) filtrados por constructora + proyecto (nombres)
-- Ejecutar en Workbench (local y prod)

DROP PROCEDURE IF EXISTS SP_CONSULTAR_CONTRATOS_FILTRADOS;

DELIMITER $$

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
END$$

DELIMITER ;
