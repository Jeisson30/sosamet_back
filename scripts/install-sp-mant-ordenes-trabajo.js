/**
 * Instala SPs de mantenimiento OT:
 *  - SP_ACTUALIZAR_ORDEN_TRABAJO
 *  - SP_ANULAR_ORDEN_TRABAJO
 *  - SP_ELIMINAR_ORDEN_TRABAJO
 *
 * Uso: node scripts/install-sp-mant-ordenes-trabajo.js
 */
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config({ override: true });

const SQL = `
DROP PROCEDURE IF EXISTS SP_ACTUALIZAR_ORDEN_TRABAJO;
DROP PROCEDURE IF EXISTS SP_ANULAR_ORDEN_TRABAJO;
DROP PROCEDURE IF EXISTS SP_ELIMINAR_ORDEN_TRABAJO;

CREATE PROCEDURE SP_ACTUALIZAR_ORDEN_TRABAJO(
    IN p_id_order_work            INT,
    IN p_actualizar_cabecera      TINYINT,
    IN p_actualizar_detalle       TINYINT,

    /* Cabecera */
    IN p_encargado_id             INT,
    IN p_fecha_entrega            DATE,
    IN p_observaciones            TEXT,
    IN p_tipo_actividad           VARCHAR(50),
    IN p_constructora             VARCHAR(150),
    IN p_proyecto                 VARCHAR(150),
    IN p_tipo_documento           VARCHAR(150),
    IN p_contrato                 VARCHAR(150),
    IN p_autorizo                 VARCHAR(150),
    IN p_empresa_asociada_id      INT,

    /* Detalle */
    IN p_id_order_work_detail     INT,
    IN p_item                     VARCHAR(100),
    IN p_ref                      VARCHAR(100),
    IN p_descripcion              TEXT,
    IN p_cantidad                 DECIMAL(18,2),
    IN p_um                       VARCHAR(50),
    IN p_ancho                    DECIMAL(18,2),
    IN p_alto                     DECIMAL(18,2),
    IN p_observaciones_item       TEXT
)
BEGIN
    DECLARE vExiste INT DEFAULT 0;
    DECLARE vEstado TINYINT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SELECT COUNT(*), IFNULL(MAX(ot_estado), 0)
      INTO vExiste, vEstado
    FROM order_work
    WHERE id_order_work = p_id_order_work;

    IF vExiste = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'La orden de trabajo no existe.';
    END IF;

    IF vEstado = 3 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No se puede editar una orden de trabajo anulada.';
    END IF;

    START TRANSACTION;

    IF p_actualizar_cabecera = 1 THEN
        UPDATE order_work
           SET encargado_id        = IFNULL(p_encargado_id, encargado_id),
               fecha_entrega       = IFNULL(p_fecha_entrega, fecha_entrega),
               observaciones       = p_observaciones,
               tipo_corte          = p_tipo_actividad,
               ot_constructora     = p_constructora,
               ot_proyecto         = p_proyecto,
               ot_tipo_documento   = p_tipo_documento,
               ot_contrato         = p_contrato,
               ot_autorizo         = p_autorizo,
               empresa_asociada_id = p_empresa_asociada_id,
               fecha_actualizacion = NOW()
         WHERE id_order_work = p_id_order_work;
    END IF;

    IF p_actualizar_detalle = 1 THEN
        IF p_id_order_work_detail IS NULL OR p_id_order_work_detail <= 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'El id del detalle es obligatorio para actualizar ítems.';
        END IF;

        IF NOT EXISTS (
            SELECT 1
              FROM order_work_detail
             WHERE id_order_work_detail = p_id_order_work_detail
               AND id_order_work = p_id_order_work
        ) THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'El ítem no pertenece a la orden de trabajo.';
        END IF;

        UPDATE order_work_detail
           SET item          = p_item,
               ref           = p_ref,
               descripcion   = p_descripcion,
               cantidad      = p_cantidad,
               um            = p_um,
               ancho         = p_ancho,
               alto          = p_alto,
               observaciones = p_observaciones_item
         WHERE id_order_work_detail = p_id_order_work_detail
           AND id_order_work = p_id_order_work;

        UPDATE order_work
           SET fecha_actualizacion = NOW()
         WHERE id_order_work = p_id_order_work;
    END IF;

    COMMIT;

    SELECT
        1 AS resultado,
        CONCAT('Orden de trabajo ', p_id_order_work, ' actualizada correctamente.') AS mensaje,
        p_id_order_work AS id_order_work;
END;

CREATE PROCEDURE SP_ANULAR_ORDEN_TRABAJO(
    IN p_id_order_work INT,
    IN p_usuario INT
)
BEGIN
    DECLARE vExiste INT DEFAULT 0;
    DECLARE vEstado TINYINT DEFAULT 0;
    DECLARE vConsecutivo VARCHAR(50);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SELECT COUNT(*), IFNULL(MAX(ot_estado), 0), MAX(consecutivo)
      INTO vExiste, vEstado, vConsecutivo
    FROM order_work
    WHERE id_order_work = p_id_order_work;

    IF vExiste = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'La orden de trabajo no existe.';
    END IF;

    IF vEstado = 3 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'La orden de trabajo ya se encuentra anulada.';
    END IF;

    START TRANSACTION;

    UPDATE order_work
       SET ot_estado = 3,
           fecha_actualizacion = NOW()
     WHERE id_order_work = p_id_order_work;

    COMMIT;

    SELECT
        1 AS resultado,
        CONCAT('Orden ', IFNULL(vConsecutivo, p_id_order_work), ' anulada correctamente.') AS mensaje,
        p_id_order_work AS id_order_work,
        3 AS estado;
END;

CREATE PROCEDURE SP_ELIMINAR_ORDEN_TRABAJO(
    IN p_id_order_work INT
)
BEGIN
    DECLARE vExiste INT DEFAULT 0;
    DECLARE vConsecutivo VARCHAR(50);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Ocurrió un error al eliminar la orden de trabajo.';
    END;

    SELECT COUNT(*), MAX(consecutivo)
      INTO vExiste, vConsecutivo
    FROM order_work
    WHERE id_order_work = p_id_order_work;

    IF vExiste = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'La orden de trabajo no existe.';
    END IF;

    START TRANSACTION;

    /* Solo elimina la OT y su detalle. No toca actas/planos. */
    DELETE FROM order_work_detail
     WHERE id_order_work = p_id_order_work;

    DELETE FROM order_work
     WHERE id_order_work = p_id_order_work;

    COMMIT;

    SELECT
        1 AS resultado,
        CONCAT('La orden de trabajo ', IFNULL(vConsecutivo, p_id_order_work), ' fue eliminada correctamente.') AS mensaje,
        p_id_order_work AS id_order_work;
END;
`;

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  try {
    await conn.query(SQL);
    console.log('OK: SP_ACTUALIZAR / SP_ANULAR / SP_ELIMINAR_ORDEN_TRABAJO instalados.');
  } catch (err) {
    console.error('ERROR instalando SPs:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
