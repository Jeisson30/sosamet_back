/**
 * Permite guardar actividades adicionales ligadas a la OT
 * sin haber finalizado (id_ejecucion NULL).
 * Uso: node scripts/patch-adicionales-sin-ejecucion.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  await conn.query(`
    ALTER TABLE ejecucion_corte_adicional
      DROP FOREIGN KEY fk_adicional_ejecucion
  `).catch((e) => {
    if (!String(e.message).includes('check that it exists')) throw e;
  });

  await conn.query(`
    ALTER TABLE ejecucion_corte_adicional
      MODIFY COLUMN id_ejecucion INT NULL
      COMMENT 'NULL = borrador guardado en OT; se liga al finalizar'
  `);

  await conn.query(`
    ALTER TABLE ejecucion_corte_adicional
      ADD CONSTRAINT fk_adicional_ejecucion
      FOREIGN KEY (id_ejecucion) REFERENCES ejecucion_corte (id_ejecucion)
      ON DELETE SET NULL
  `).catch((e) => {
    if (!String(e.message).includes('Duplicate')) throw e;
  });

  await conn.query(`DROP PROCEDURE IF EXISTS SP_GUARDAR_ACTIVIDADES_ADICIONALES_OT`);
  await conn.query(`
CREATE PROCEDURE SP_GUARDAR_ACTIVIDADES_ADICIONALES_OT(
    IN p_id_order_work INT,
    IN p_usuario_id INT
)
BEGIN
    DECLARE vExiste INT DEFAULT 0;
    DECLARE vEstadoOt TINYINT DEFAULT 0;

    IF p_id_order_work IS NULL OR p_id_order_work <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'id_order_work es obligatorio.';
    END IF;

    SELECT COUNT(*), IFNULL(MAX(ot_estado), 0)
      INTO vExiste, vEstadoOt
    FROM order_work
    WHERE id_order_work = p_id_order_work;

    IF vExiste = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La orden de trabajo no existe.';
    END IF;

    IF vEstadoOt = 3 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se puede editar adicionales de una OT anulada.';
    END IF;

    IF vEstadoOt = 2 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La OT ya fue finalizada; no se pueden agregar adicionales.';
    END IF;

    /* Borra solo borradores (aún no ligados a ejecución) */
    DELETE FROM ejecucion_corte_adicional
     WHERE id_order_work = p_id_order_work
       AND id_ejecucion IS NULL;

    SELECT
        1 AS Codigo,
        'Listo para insertar actividades adicionales.' AS Mensaje,
        p_id_order_work AS id_order_work;
END
  `);

  await conn.query(`DROP PROCEDURE IF EXISTS SP_CONSULTAR_ACTIVIDADES_ADICIONALES_OT`);
  await conn.query(`
CREATE PROCEDURE SP_CONSULTAR_ACTIVIDADES_ADICIONALES_OT(
    IN p_id_order_work INT
)
BEGIN
    SELECT
        id_adicional,
        id_ejecucion,
        id_order_work,
        item,
        contrato_no,
        proyecto,
        descripcion,
        cantidad,
        um,
        ancho,
        alto,
        acta_medida_no,
        orden_no,
        plano_no,
        observaciones,
        fecha_creacion
    FROM ejecucion_corte_adicional
    WHERE id_order_work = p_id_order_work
    ORDER BY id_adicional ASC;
END
  `);

  console.log('OK: adicionales por OT (sin ejecución) listo.');
  await conn.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
