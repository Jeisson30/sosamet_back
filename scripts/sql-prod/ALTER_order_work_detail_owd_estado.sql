-- Ejecución de Cortes — estado por ítem de OT
-- Ejecutar en Workbench (local y luego prod)

ALTER TABLE order_work_detail
  ADD COLUMN owd_estado TINYINT NOT NULL DEFAULT 1
  COMMENT '1=Pendiente, 2=Completado, 3=Anulado'
  AFTER observaciones;
