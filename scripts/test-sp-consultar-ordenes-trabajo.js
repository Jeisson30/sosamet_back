const db = require('../src/config/db');

function call(label, params) {
  return new Promise((resolve) => {
    db.query('CALL SP_CONSULTAR_ORDENES_TRABAJO(?,?,?,?,?,?,?)', params, (err, results) => {
      if (err) {
        console.error(`\n[${label}] ERROR:`, err.message);
        resolve();
        return;
      }
      const cab = Array.isArray(results?.[0]) ? results[0] : [];
      const det = Array.isArray(results?.[1]) ? results[1] : [];
      console.log(`\n=== ${label} ===`);
      console.log(`cabecera: ${cab.length} | detalle: ${det.length}`);
      if (cab[0]) {
        console.log('primera cabecera:', {
          id: cab[0].id_order_work,
          consecutivo: cab[0].consecutivo,
          encargado: cab[0].encargado,
          constructora: cab[0].constructora,
          proyecto: cab[0].proyecto,
          contrato: cab[0].numero_contrato,
          total_items: cab[0].total_items,
          actas: cab[0].consecutivos_acta,
          planos: cab[0].consecutivos_plano,
        });
      }
      if (det[0]) {
        console.log('primer detalle:', {
          id_ow: det[0].id_order_work,
          item: det[0].item,
          ref: det[0].ref,
          amd_id: det[0].amd_id,
          acta: det[0].consecutivo_acta,
          plano: det[0].consecutivo_plano,
        });
      }
      resolve();
    });
  });
}

(async () => {
  await call('TODAS', [null, null, null, null, null, null, null]);
  await call('BUSCAR OT-AM', ['OT-AM', null, null, null, null, null, null]);
  await call('ENCARGADO 27', [null, 27, null, null, null, null, null]);
  await call('FECHA AGO 2026', [null, null, '2026-08-01', '2026-08-31', null, null, null]);
  await call('CONSTRUCTORA BOLIVAR', [null, null, null, null, 'BOLIVAR', null, null]);
  await call('PROYECTO AUSTRA', [null, null, null, null, null, 'AUSTRA', null]);
  await call('CONTRATO 10009615', [null, null, null, null, null, null, '10009615']);
  await call('BUSCAR PLANO P-0007', ['P-0007', null, null, null, null, null, null]);
  db.end();
})();
