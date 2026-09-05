-- Columna fondo en detalle actas de medida (medición en sitio)
-- Ejecutar en Workbench (local y prod)

ALTER TABLE actas_medida_detalle
  ADD COLUMN amd_fondo DECIMAL(18,3) NULL
  COMMENT 'Profundidad / fondo medido en acta'
  AFTER amd_alto;
