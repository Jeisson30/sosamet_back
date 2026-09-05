/**
 * Parche: SP_FINALIZAR_EJECUCION_CORTE ya no escribe empresa_asociada_id
 * en order_work (evita Duplicate entry uk_consecutivo_empresa).
 */
const db = require('../src/config/db');

const q = (sql, p = []) =>
  new Promise((res, rej) => db.query(sql, p, (e, r) => (e ? rej(e) : res(r))));

const SP = `
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
        consecutivo, id_order_work, empresa_asociada_id, encargado_id,
        tipo_corte, observaciones, estado, fecha_creacion, fecha_finalizado, usuario_creacion
    ) VALUES (
        p_consecutivo, p_id_order_work, p_empresa_asociada_id, p_encargado_id,
        p_tipo_corte, p_observaciones, 2, NOW(), NOW(), p_usuario_id
    );

    SET vIdEjecucion = LAST_INSERT_ID();

    -- Empresa solo en ejecucion_corte (no tocar order_work.empresa_asociada_id)
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
`;

(async () => {
  try {
    await q('DROP PROCEDURE IF EXISTS SP_FINALIZAR_EJECUCION_CORTE');
    await q(SP);
    console.log('OK: SP_FINALIZAR_EJECUCION_CORTE actualizado (sin escribir empresa en order_work).');
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    db.end();
  }
})();
