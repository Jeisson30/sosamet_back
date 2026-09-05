-- Campo Encargado Contrato en formulario Contrato (EAV item_documentos).
-- Oculta nit_empresa en pantalla (sigue en BD para contratos antiguos).

INSERT INTO parametros_documentos (
  tipo_doc,
  nombre_campo_doc,
  desc_campo_doc,
  estadocampo
)
SELECT
  'Contrato',
  'encargado_contrato',
  'Encargado Contrato',
  '1'
WHERE NOT EXISTS (
  SELECT 1
    FROM parametros_documentos
   WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
     AND nombre_campo_doc = 'encargado_contrato'
);

UPDATE parametros_documentos
   SET estadocampo = '0'
 WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
   AND nombre_campo_doc = 'nit_empresa';
