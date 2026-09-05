-- tipo_contrato oculto (estadocampo=0): guarda Contrato/Cotizacion/OfertaM…
-- El N° Documento (consecutivo) sigue en tipo_doc_rem / tipo_doc / tipo_documento_actap.
-- Requerido porque sp_insertar_item_documento solo inserta campos en parametros_documentos.

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Remisiones', 'tipo_contrato', 'Tipo contrato/documento', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Remisiones'
      AND nombre_campo_doc = 'tipo_contrato'
 );

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Actas De Medida', 'tipo_contrato', 'Tipo contrato/documento', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Actas De Medida'
      AND nombre_campo_doc = 'tipo_contrato'
 );

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Orden De Compra', 'tipo_contrato', 'Tipo contrato/documento', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Orden De Compra'
      AND nombre_campo_doc = 'tipo_contrato'
 );

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'ACTAS DE PAGO', 'tipo_contrato', 'Tipo contrato/documento', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'ACTAS DE PAGO'
      AND nombre_campo_doc = 'tipo_contrato'
 );
