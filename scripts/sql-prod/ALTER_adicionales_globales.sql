-- Adicionales globales por usuario (Workbench / prod)
-- Ejecutar después de tener ejecucion_corte_adicional

ALTER TABLE ejecucion_corte_adicional
  MODIFY COLUMN id_order_work INT NULL;

ALTER TABLE ejecucion_corte_adicional
  ADD COLUMN IF NOT EXISTS usuario_id INT NULL COMMENT 'Dueño del adicional' AFTER id_order_work,
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL COMMENT 'Empresa del adicional' AFTER usuario_id,
  ADD COLUMN IF NOT EXISTS tipo_actividad VARCHAR(50) NULL COMMENT 'PINTURA|FABRICACIÓN|INSTALACIÓN' AFTER empresa_id;

-- Nota: MySQL < 8.0.12 no soporta IF NOT EXISTS en ADD COLUMN.
-- Preferir: node scripts/patch-adicionales-globales.js

-- Luego recrear:
--   SP_CONSULTAR_ACTIVIDADES_ADICIONALES_USUARIO
--   SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION (incluye origen OT|ADICIONAL)
-- con el script patch-adicionales-globales.js
