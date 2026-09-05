/**
 * Instala tablas + SPs de Ejecución de Cortes.
 * Uso: node scripts/install-ejecucion-cortes.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const mysql = require('mysql2/promise');

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  console.log('=== Ejecución de Cortes: schema ===');

  if (!(await columnExists(conn, 'order_work_detail', 'owd_estado'))) {
    await conn.query(`
      ALTER TABLE order_work_detail
        ADD COLUMN owd_estado TINYINT NOT NULL DEFAULT 1
        COMMENT '1=Pendiente, 2=Completado, 3=Anulado'
        AFTER observaciones
    `);
    console.log('+ order_work_detail.owd_estado');
  }

  if (!(await columnExists(conn, 'order_work_detail', 'owd_fecha_finalizado'))) {
    await conn.query(`
      ALTER TABLE order_work_detail
        ADD COLUMN owd_fecha_finalizado DATETIME NULL
        COMMENT 'Fecha en que el ítem se marcó completado en ejecución'
        AFTER owd_estado
    `);
    console.log('+ order_work_detail.owd_fecha_finalizado');
  }

  if (!(await tableExists(conn, 'ejecucion_corte'))) {
    await conn.query(`
      CREATE TABLE ejecucion_corte (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('+ tabla ejecucion_corte');
  }

  if (!(await tableExists(conn, 'ejecucion_corte_adicional'))) {
    await conn.query(`
      CREATE TABLE ejecucion_corte_adicional (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('+ tabla ejecucion_corte_adicional');
  }

  await conn.query(`
    INSERT INTO parametros_consecutivos
      (codigo_documento, descripcion, prefijo, sufijo, separador, longitud, caracter_relleno, numero_actual, activo)
    SELECT 'EJECUCION_CORTE', 'Ejecución de Cortes', 'EC', NULL, '-', 4, '0', 0, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM parametros_consecutivos WHERE codigo_documento = 'EJECUCION_CORTE'
    )
  `);
  console.log('+ parametros_consecutivos EJECUCION_CORTE');

  await conn.query(`DROP PROCEDURE IF EXISTS SP_FINALIZAR_EJECUCION_CORTE`);
  await conn.query(`
CREATE PROCEDURE SP_FINALIZAR_EJECUCION_CORTE(
    IN p_id_order_work INT,
    IN p_empresa_asociada_id INT,
    IN p_encargado_id INT,
    IN p_tipo_corte VARCHAR(50),
    IN p_observaciones TEXT,
    IN p_usuario_id INT,
    IN p_items_esperados INT,
    IN p_consecutivo VARCHAR(50)
)
BEGIN
    DECLARE vExiste INT DEFAULT 0;
    DECLARE vEstadoOt TINYINT DEFAULT 0;
    DECLARE vTotalItems INT DEFAULT 0;
    DECLARE vPendientes INT DEFAULT 0;
    DECLARE vYaEjecutada INT DEFAULT 0;
    DECLARE vIdEjecucion INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_id_order_work IS NULL OR p_id_order_work <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'id_order_work es obligatorio.';
    END IF;

    IF p_empresa_asociada_id IS NULL OR p_empresa_asociada_id <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'empresa_asociada_id es obligatoria.';
    END IF;

    IF p_encargado_id IS NULL OR p_encargado_id <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'encargado_id es obligatorio.';
    END IF;

    IF p_tipo_corte IS NULL OR TRIM(p_tipo_corte) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tipo_corte es obligatorio.';
    END IF;

    IF p_consecutivo IS NULL OR TRIM(p_consecutivo) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'consecutivo de ejecución es obligatorio.';
    END IF;

    SELECT COUNT(*), IFNULL(MAX(ot_estado), 0)
      INTO vExiste, vEstadoOt
    FROM order_work
    WHERE id_order_work = p_id_order_work;

    IF vExiste = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La orden de trabajo no existe.';
    END IF;

    IF vEstadoOt = 3 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se puede finalizar una OT anulada.';
    END IF;

    IF vEstadoOt = 2 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La orden de trabajo ya fue finalizada en ejecución.';
    END IF;

    SELECT COUNT(*) INTO vYaEjecutada
    FROM ejecucion_corte
    WHERE id_order_work = p_id_order_work;

    IF vYaEjecutada > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ya existe una ejecución finalizada para esta OT.';
    END IF;

    SELECT COUNT(*) INTO vTotalItems
    FROM order_work_detail
    WHERE id_order_work = p_id_order_work;

    IF vTotalItems = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La OT no tiene ítems para finalizar.';
    END IF;

    IF p_items_esperados IS NULL OR p_items_esperados <> vTotalItems THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Debe marcar todos los ítems de la OT antes de finalizar.';
    END IF;

    START TRANSACTION;

    UPDATE order_work_detail
       SET owd_estado = 2,
           owd_fecha_finalizado = IFNULL(owd_fecha_finalizado, NOW())
     WHERE id_order_work = p_id_order_work;

    SELECT COUNT(*) INTO vPendientes
    FROM order_work_detail
    WHERE id_order_work = p_id_order_work
      AND IFNULL(owd_estado, 1) <> 2;

    IF vPendientes > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Quedan ítems pendientes; no se puede finalizar.';
    END IF;

    INSERT INTO ejecucion_corte (
        consecutivo,
        id_order_work,
        empresa_asociada_id,
        encargado_id,
        tipo_corte,
        observaciones,
        estado,
        fecha_creacion,
        fecha_finalizado,
        usuario_creacion
    ) VALUES (
        p_consecutivo,
        p_id_order_work,
        p_empresa_asociada_id,
        p_encargado_id,
        p_tipo_corte,
        p_observaciones,
        2,
        NOW(),
        NOW(),
        p_usuario_id
    );

    SET vIdEjecucion = LAST_INSERT_ID();

    -- Empresa de ejecución solo en ejecucion_corte (evita choque uk_consecutivo_empresa)
    UPDATE order_work
       SET ot_estado = 2,
           fecha_actualizacion = NOW(),
           tipo_corte = IFNULL(p_tipo_corte, tipo_corte),
           observaciones = IFNULL(p_observaciones, observaciones)
     WHERE id_order_work = p_id_order_work;

    COMMIT;

    SELECT
        1 AS Codigo,
        'Ejecución finalizada correctamente.' AS Mensaje,
        vIdEjecucion AS id_ejecucion,
        p_consecutivo AS consecutivo,
        p_id_order_work AS id_order_work,
        2 AS estado;
END
  `);
  console.log('+ SP_FINALIZAR_EJECUCION_CORTE');

  await conn.query(`DROP PROCEDURE IF EXISTS SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION`);
  await conn.query(`
CREATE PROCEDURE SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION(
    IN p_encargado_id INT,
    IN p_buscar VARCHAR(150)
)
BEGIN
    SELECT
        D.id_order_work_detail,
        D.id_order_work,
        OW.consecutivo AS orden_trabajo,
        OW.ot_proyecto AS proyecto,
        OW.ot_contrato AS contrato_no,
        OW.fecha_creacion AS fecha_inicio,
        IFNULL(D.owd_fecha_finalizado, EC.fecha_finalizado) AS fecha_finalizado,
        D.item,
        D.descripcion,
        D.cantidad,
        D.um,
        D.ancho,
        D.alto,
        D.owd_estado AS estado,
        EC.id_ejecucion,
        EC.consecutivo AS consecutivo_ejecucion,
        EC.empresa_asociada_id,
        E.nombre_empresa AS empresa_asociada,
        EC.tipo_corte,
        OW.encargado_id,
        CONCAT(IFNULL(U.nombre,''), ' ', IFNULL(U.apellido,'')) AS encargado
    FROM order_work_detail D
    INNER JOIN order_work OW
        ON OW.id_order_work = D.id_order_work
    LEFT JOIN ejecucion_corte EC
        ON EC.id_order_work = OW.id_order_work
    LEFT JOIN empresa E
        ON E.id = EC.empresa_asociada_id
    LEFT JOIN usuarios U
        ON U.id_usuario = OW.encargado_id
    WHERE D.owd_estado = 2
      AND IFNULL(OW.ot_estado, 0) <> 3
      AND (
            p_encargado_id IS NULL
            OR p_encargado_id = 0
            OR OW.encargado_id = p_encargado_id
      )
      AND (
            p_buscar IS NULL
            OR TRIM(p_buscar) = ''
            OR OW.consecutivo LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.ot_proyecto, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(OW.ot_contrato, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(D.item, '') LIKE CONCAT('%', p_buscar, '%')
            OR IFNULL(EC.consecutivo, '') LIKE CONCAT('%', p_buscar, '%')
      )
    ORDER BY IFNULL(D.owd_fecha_finalizado, EC.fecha_finalizado) DESC,
             D.id_order_work_detail DESC;
END
  `);
  console.log('+ SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION');

  await conn.end();
  console.log('OK: ejecución de cortes instalada.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
