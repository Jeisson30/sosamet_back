-- Estado editable de la grilla de actas por contrato (no es el acta AM-xxxx).
-- Persiste ancho/alto/fondo/observaciones (y detalle/UM de ítems fuera de plano).

CREATE TABLE IF NOT EXISTS contrato_grilla_acta (
  id INT AUTO_INCREMENT PRIMARY KEY,
  numero_contrato VARCHAR(100) NOT NULL,
  item VARCHAR(50) NOT NULL,
  detalle VARCHAR(1000) NULL,
  unidad_medida VARCHAR(20) NULL,
  ancho DECIMAL(18,3) NULL,
  alto DECIMAL(18,3) NULL,
  fondo DECIMAL(18,3) NULL,
  observaciones TEXT NULL,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_contrato_grilla_item (numero_contrato, item)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
