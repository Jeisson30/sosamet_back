-- tipo_doc_catalogo oculto (estadocampo=0): Contrato, Cotizacion, OrdenDT, OrdenDC…
-- En CONTRATO el campo visible tipo_contrato = Suministro/Instalación; el catálogo va aparte.

INSERT INTO parametros_documentos (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
SELECT 'Contrato', 'tipo_doc_catalogo', 'Tipo documento catálogo', '0'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM parametros_documentos
    WHERE tipo_doc COLLATE utf8mb4_general_ci = 'Contrato'
      AND nombre_campo_doc = 'tipo_doc_catalogo'
 );
