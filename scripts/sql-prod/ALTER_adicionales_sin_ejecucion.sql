-- Actividades adicionales: borrador por OT + estado por fila
-- 1) id_ejecucion NULL = guardado previo a FINALIZAR
-- 2) adc_estado 1=Pendiente / 2=Completado

ALTER TABLE ejecucion_corte_adicional
  DROP FOREIGN KEY fk_adicional_ejecucion;

ALTER TABLE ejecucion_corte_adicional
  MODIFY COLUMN id_ejecucion INT NULL
  COMMENT 'NULL = borrador en OT; se liga al finalizar';

ALTER TABLE ejecucion_corte_adicional
  ADD CONSTRAINT fk_adicional_ejecucion
  FOREIGN KEY (id_ejecucion) REFERENCES ejecucion_corte (id_ejecucion)
  ON DELETE SET NULL;

-- Si ya existen las columnas, omitir este ALTER:
ALTER TABLE ejecucion_corte_adicional
  ADD COLUMN adc_estado TINYINT NOT NULL DEFAULT 1
    COMMENT '1=Pendiente, 2=Completado' AFTER observaciones,
  ADD COLUMN adc_fecha_finalizado DATETIME NULL AFTER adc_estado;

-- Local: node scripts/patch-adicionales-sin-ejecucion.js
--        node scripts/patch-adc-estado.js
