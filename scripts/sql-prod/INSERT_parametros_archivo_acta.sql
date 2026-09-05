-- Archivo general del acta (PDF/imagen), no por ítem.

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Actas De Medida', 'archivo_acta', 'Archivo acta de medida', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Actas De Medida'
      AND nombre_campo_doc = 'archivo_acta'
 );
