-- Catálogo de N° documento por constructora + proyecto + tipo
-- Unicidad GLOBAL de numero_documento
-- Ejecutar en Workbench (local y prod)

CREATE TABLE IF NOT EXISTS documento_numero (
  id_documento_numero INT NOT NULL AUTO_INCREMENT,
  id_constructora INT NOT NULL,
  id_proyecto INT NOT NULL,
  tipo_doc VARCHAR(50) NOT NULL,
  numero_documento VARCHAR(100) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_documento_numero),
  UNIQUE KEY uk_documento_numero (numero_documento),
  KEY idx_doc_num_proyecto_tipo (id_proyecto, tipo_doc),
  KEY idx_doc_num_constructora (id_constructora),
  CONSTRAINT fk_doc_num_constructora
    FOREIGN KEY (id_constructora) REFERENCES constructoras (id_constructora),
  CONSTRAINT fk_doc_num_proyecto
    FOREIGN KEY (id_proyecto) REFERENCES proyectos_constructoras (id_proyecto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
