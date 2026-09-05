-- Vínculo contrato / cotización (documentos sin contrato)
-- Ejecutar en Workbench (local y luego prod)
-- No destruye datos: DEFAULT 'CONTRATO' deja filas existentes igual.

-- Acta detalle: la clave sigue en amd_numero_contrato (contrato O cotización)
ALTER TABLE actas_medida_detalle
  ADD COLUMN amd_tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
  COMMENT 'CONTRATO | COTIZACION — discriminador de amd_numero_contrato'
  AFTER amd_numero_contrato;

-- OT: clave en ot_contrato
ALTER TABLE order_work
  ADD COLUMN ot_tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
  COMMENT 'CONTRATO | COTIZACION — discriminador de ot_contrato'
  AFTER ot_contrato;

-- Remisiones plano
ALTER TABLE remisiones_plano
  ADD COLUMN tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
  COMMENT 'CONTRATO | COTIZACION — discriminador de contrato'
  AFTER contrato;

-- Orden de compra detalle
ALTER TABLE orden_compra
  ADD COLUMN tipo_vinculo VARCHAR(20) NOT NULL DEFAULT 'CONTRATO'
  COMMENT 'CONTRATO | COTIZACION — discriminador de contrato'
  AFTER contrato;
