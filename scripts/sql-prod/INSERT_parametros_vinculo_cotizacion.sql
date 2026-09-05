-- Campos EAV ocultos para vínculo cotización (estadocampo=0 → no salen en formulario)
-- El SP sp_insertar_item_documento solo inserta si el campo existe en parametros_documentos.

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Remisiones', 'tipo_vinculo', 'Tipo vínculo', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Remisiones'
      AND nombre_campo_doc = 'tipo_vinculo'
 );

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Remisiones', 'numero_cotizacion', 'N°.Cotización', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Remisiones'
      AND nombre_campo_doc = 'numero_cotizacion'
 );

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Actas De Medida', 'tipo_vinculo', 'Tipo vínculo', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Actas De Medida'
      AND nombre_campo_doc = 'tipo_vinculo'
 );

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Actas De Medida', 'numero_cotizacion', 'N°.Cotización', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Actas De Medida'
      AND nombre_campo_doc = 'numero_cotizacion'
 );

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Orden De Compra', 'tipo_vinculo', 'Tipo vínculo', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Orden De Compra'
      AND nombre_campo_doc = 'tipo_vinculo'
 );

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Orden De Compra', 'numero_cotizacion', 'N°.Cotización', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Orden De Compra'
      AND nombre_campo_doc = 'numero_cotizacion'
 );

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'ACTAS DE PAGO', 'tipo_vinculo', 'Tipo vínculo', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'ACTAS DE PAGO'
      AND nombre_campo_doc = 'tipo_vinculo'
 );

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'ACTAS DE PAGO', 'numero_cotizacion', 'N°.Cotización', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'ACTAS DE PAGO'
      AND nombre_campo_doc = 'numero_cotizacion'
 );
