-- Discriminador CONTRATO | COTIZACION en tablas que guardan clave de amarre
-- Ejecutar en Workbench (local y prod)

ALTER TABLE ejecucion_corte_adicional
  ADD COLUMN tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
  COMMENT 'CONTRATO | COTIZACION — discriminador de contrato_no'
  AFTER contrato_no;

ALTER TABLE liquidacion_corte_plano
  ADD COLUMN tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
  COMMENT 'CONTRATO | COTIZACION — discriminador de no_contrato'
  AFTER no_contrato;
