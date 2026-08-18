const db = require('../src/config/db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

(async () => {
  try {
    // 1) Update cabecera de OT existente (id 6)
    const upd = await q(
      'CALL SP_ACTUALIZAR_ORDEN_TRABAJO(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        6, 1, 0,
        27, '2026-08-30', 'obs update test', 'FABRICACIÓN',
        'BOLIVAR', 'AUSTRA', 'CO', '123ABC', 'JDPB', null,
        null, null, null, null, null, null, null, null, null,
      ]
    );
    console.log('UPDATE:', upd?.[0]?.[0]);

    // 2) Crear OT temporal para anular/eliminar
    const ins = await q(
      `INSERT INTO order_work
        (consecutivo, empresa_asociada_id, encargado_id, fecha_entrega, observaciones, tipo_corte, fecha_creacion, ot_constructora, ot_proyecto, ot_tipo_documento, ot_contrato, ot_autorizo, ot_estado)
       VALUES ('OT-TMP-TEST', NULL, 27, CURDATE(), 'tmp', 'PINTURA', NOW(), 'TMP', 'TMP', 'CO', 'TMP', 'X', 1)`
    );
    const id = ins.insertId;
    await q(
      `INSERT INTO order_work_detail (id_order_work, amd_id, ref, item, descripcion, cantidad, um, fecha_creacion)
       VALUES (?, NULL, 'R1', '1', 'tmp item', 1, 'UND', NOW())`,
      [id]
    );
    console.log('TMP created id=', id);

    const anu = await q('CALL SP_ANULAR_ORDEN_TRABAJO(?, ?)', [id, 27]);
    console.log('ANULAR:', anu?.[0]?.[0]);

    const estado = await q('SELECT ot_estado FROM order_work WHERE id_order_work=?', [id]);
    console.log('estado after anular:', estado?.[0]);

    // No se puede editar anulada
    try {
      await q(
        'CALL SP_ACTUALIZAR_ORDEN_TRABAJO(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, 1, 0, 27, null, 'x', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]
      );
      console.log('ERROR: editó anulada');
    } catch (e) {
      console.log('Bloqueo edición anulada OK:', e.message);
    }

    const del = await q('CALL SP_ELIMINAR_ORDEN_TRABAJO(?)', [id]);
    console.log('ELIMINAR:', del?.[0]?.[0]);

    const gone = await q('SELECT COUNT(*) c FROM order_work WHERE id_order_work=?', [id]);
    console.log('existe after delete:', gone?.[0]?.c);
  } catch (e) {
    console.error('TEST FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    db.end();
  }
})();
