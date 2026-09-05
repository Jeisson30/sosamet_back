-- Corrige registros ya guardados sin tipo_doc_catalogo / AIU.tipo_doc incorrecto.

-- CUMAR-001 → Contrato
INSERT INTO item_documentos (tipo_doc, numerodoc, nombre_campo_doc, valor_campo_doc)
SELECT 'CONTRATO', 'CUMAR-001', 'tipo_doc_catalogo', 'Contrato'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM item_documentos
    WHERE tipo_doc = 'CONTRATO'
      AND numerodoc = 'CUMAR-001'
      AND nombre_campo_doc = 'tipo_doc_catalogo'
 );

UPDATE AIU
   SET tipo_doc = 'Contrato'
 WHERE numdoc = 'CUMAR-001'
   AND (tipo_doc IS NULL OR TRIM(tipo_doc) = '' OR tipo_doc = 'Contrato');

-- ORDT-001 → OrdenDT
INSERT INTO item_documentos (tipo_doc, numerodoc, nombre_campo_doc, valor_campo_doc)
SELECT 'CONTRATO', 'ORDT-001', 'tipo_doc_catalogo', 'OrdenDT'
  FROM DUAL
 WHERE NOT EXISTS (
   SELECT 1 FROM item_documentos
    WHERE tipo_doc = 'CONTRATO'
      AND numerodoc = 'ORDT-001'
      AND nombre_campo_doc = 'tipo_doc_catalogo'
 );

UPDATE AIU
   SET tipo_doc = 'OrdenDT'
 WHERE numdoc = 'ORDT-001';

UPDATE iva_pleno
   SET tipo_doc = 'OrdenDT'
 WHERE numdoc = 'ORDT-001';
