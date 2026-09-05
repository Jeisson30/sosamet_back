-- ============================================================
-- Ejecución de Cortes — schema + SPs (producción / Workbench)
-- Requiere: order_work, order_work_detail, empresa, parametros_consecutivos,
--           SP_GENERAR_CONSECUTIVO
-- ============================================================

-- 1) Columnas en detalle OT
ALTER TABLE order_work_detail
  ADD COLUMN IF NOT EXISTS owd_estado TINYINT NOT NULL DEFAULT 1
  COMMENT '1=Pendiente, 2=Completado, 3=Anulado';

-- MySQL < 8.0.12 no soporta IF NOT EXISTS en ADD COLUMN; usar script install-ejecucion-cortes.js
-- o ejecutar manualmente si falla:

-- ALTER TABLE order_work_detail
--   ADD COLUMN owd_estado TINYINT NOT NULL DEFAULT 1 AFTER observaciones;
-- ALTER TABLE order_work_detail
--   ADD COLUMN owd_fecha_finalizado DATETIME NULL AFTER owd_estado;

ALTER TABLE order_work_detail
  ADD COLUMN IF NOT EXISTS owd_fecha_finalizado DATETIME NULL
  COMMENT 'Fecha en que el ítem se marcó completado en ejecución';

-- 2) Tablas
CREATE TABLE IF NOT EXISTS ejecucion_corte (
  id_ejecucion INT NOT NULL AUTO_INCREMENT,
  consecutivo VARCHAR(50) NOT NULL,
  id_order_work INT NOT NULL,
  empresa_asociada_id INT NOT NULL,
  encargado_id INT NOT NULL,
  tipo_corte VARCHAR(50) NULL,
  observaciones TEXT NULL,
  estado TINYINT NOT NULL DEFAULT 2 COMMENT '2=Finalizada',
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_finalizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_creacion INT NULL,
  PRIMARY KEY (id_ejecucion),
  UNIQUE KEY uk_ejecucion_consecutivo (consecutivo),
  UNIQUE KEY uk_ejecucion_ot (id_order_work),
  KEY idx_ejecucion_empresa (empresa_asociada_id),
  KEY idx_ejecucion_encargado (encargado_id),
  CONSTRAINT fk_ejecucion_order_work
    FOREIGN KEY (id_order_work) REFERENCES order_work (id_order_work)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ejecucion_corte_adicional (
  id_adicional INT NOT NULL AUTO_INCREMENT,
  id_ejecucion INT NOT NULL,
  id_order_work INT NOT NULL,
  item VARCHAR(100) NULL,
  contrato_no VARCHAR(150) NULL,
  proyecto VARCHAR(150) NULL,
  descripcion TEXT NULL,
  cantidad DECIMAL(18,2) NULL,
  um VARCHAR(50) NULL,
  ancho DECIMAL(18,2) NULL,
  alto DECIMAL(18,2) NULL,
  acta_medida_no VARCHAR(150) NULL,
  orden_no VARCHAR(50) NULL,
  plano_no VARCHAR(150) NULL,
  observaciones TEXT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_adicional),
  KEY idx_adicional_ejecucion (id_ejecucion),
  KEY idx_adicional_ot (id_order_work),
  CONSTRAINT fk_adicional_ejecucion
    FOREIGN KEY (id_ejecucion) REFERENCES ejecucion_corte (id_ejecucion)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Consecutivo EC-
INSERT INTO parametros_consecutivos
  (codigo_documento, descripcion, prefijo, sufijo, separador, longitud, caracter_relleno, numero_actual, activo)
SELECT 'EJECUCION_CORTE', 'Ejecución de Cortes', 'EC', NULL, '-', 4, '0', 0, 1
WHERE NOT EXISTS (
  SELECT 1 FROM parametros_consecutivos WHERE codigo_documento = 'EJECUCION_CORTE'
);

-- 4) SPs: ejecutar también el contenido de install-ejecucion-cortes.js
--    (SP_FINALIZAR_EJECUCION_CORTE + SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION)
--    o re-ejecutar: node scripts/install-ejecucion-cortes.js en un entorno con acceso a BD.
