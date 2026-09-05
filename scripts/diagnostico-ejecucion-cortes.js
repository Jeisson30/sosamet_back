/**
 * Diagnóstico Ejecución de Cortes:
 * integridad OT / ejecución / adicionales / origen
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const mysql = require('mysql2/promise');

const ok = (msg) => console.log(`  OK  ${msg}`);
const warn = (msg) => console.log(`  WARN ${msg}`);
const fail = (msg) => console.log(`  FAIL ${msg}`);

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const q = async (sql, p = []) => {
    const [r] = await c.query(sql, p);
    return r;
  };

  let fails = 0;
  const markFail = (msg) => {
    fails++;
    fail(msg);
  };

  console.log('\n=== 1) Estructura tablas ===');
  for (const table of [
    'order_work',
    'order_work_detail',
    'ejecucion_corte',
    'ejecucion_corte_adicional',
  ]) {
    const cols = await q(`SHOW COLUMNS FROM ${table}`);
    ok(`${table}: ${cols.map((x) => x.Field).join(', ')}`);
  }

  const adicCols = (
    await q('SHOW COLUMNS FROM ejecucion_corte_adicional')
  ).map((x) => x.Field);
  for (const col of [
    'usuario_id',
    'empresa_id',
    'tipo_actividad',
    'adc_estado',
    'adc_fecha_finalizado',
    'id_order_work',
    'id_ejecucion',
  ]) {
    if (adicCols.includes(col)) ok(`adicional.${col}`);
    else markFail(`falta adicional.${col}`);
  }

  console.log('\n=== 2) SPs ===');
  const sps = await q(
    `SHOW PROCEDURE STATUS WHERE Db = DATABASE()
       AND Name IN (
         'SP_FINALIZAR_EJECUCION_CORTE',
         'SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION',
         'SP_CONSULTAR_ACTIVIDADES_ADICIONALES_USUARIO',
         'SP_GENERAR_CONSECUTIVO'
       )`
  );
  const spNames = sps.map((s) => s.Name);
  for (const name of [
    'SP_FINALIZAR_EJECUCION_CORTE',
    'SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION',
    'SP_CONSULTAR_ACTIVIDADES_ADICIONALES_USUARIO',
    'SP_GENERAR_CONSECUTIVO',
  ]) {
    if (spNames.includes(name)) ok(name);
    else markFail(`falta ${name}`);
  }

  console.log('\n=== 3) Datos OT / ejecución ===');
  const ots = await q(
    `SELECT id_order_work, consecutivo, ot_estado, encargado_id, empresa_asociada_id
       FROM order_work ORDER BY id_order_work`
  );
  console.table(ots);

  const ecs = await q(
    `SELECT id_ejecucion, consecutivo, id_order_work, empresa_asociada_id, encargado_id, tipo_corte, estado
       FROM ejecucion_corte ORDER BY id_ejecucion`
  );
  console.table(ecs);

  // 1 OT finalizada (estado 2) debe tener exactamente 1 ejecucion
  const otFin = ots.filter((o) => Number(o.ot_estado) === 2);
  for (const ot of otFin) {
    const linked = ecs.filter((e) => e.id_order_work === ot.id_order_work);
    if (linked.length === 1) {
      ok(
        `OT ${ot.consecutivo} (id=${ot.id_order_work}) → ejecución ${linked[0].consecutivo}`
      );
      if (!linked[0].empresa_asociada_id) {
        markFail(
          `ejecución ${linked[0].consecutivo} sin empresa_asociada_id`
        );
      } else {
        ok(
          `ejecución ${linked[0].consecutivo} empresa=${linked[0].empresa_asociada_id}`
        );
      }
    } else if (linked.length === 0) {
      markFail(
        `OT ${ot.consecutivo} está finalizada (ot_estado=2) pero no tiene ejecucion_corte`
      );
    } else {
      markFail(
        `OT ${ot.consecutivo} tiene ${linked.length} ejecuciones (debe ser 1)`
      );
    }
  }

  // ejecuciones huérfanas
  for (const e of ecs) {
    const ot = ots.find((o) => o.id_order_work === e.id_order_work);
    if (!ot) markFail(`ejecución ${e.consecutivo} sin OT`);
  }

  console.log('\n=== 4) Ítems OT (owd_estado) ===');
  const dets = await q(
    `SELECT id_order_work, COUNT(*) AS total,
            SUM(CASE WHEN IFNULL(owd_estado,1)=2 THEN 1 ELSE 0 END) AS completados,
            SUM(CASE WHEN IFNULL(owd_estado,1)<>2 THEN 1 ELSE 0 END) AS pendientes
       FROM order_work_detail
      GROUP BY id_order_work
      ORDER BY id_order_work`
  );
  console.table(dets);

  for (const ot of otFin) {
    const d = dets.find((x) => x.id_order_work === ot.id_order_work);
    if (!d) {
      markFail(`OT ${ot.consecutivo} finalizada sin ítems`);
      continue;
    }
    if (Number(d.pendientes) === 0 && Number(d.completados) > 0) {
      ok(
        `OT ${ot.consecutivo}: ${d.completados}/${d.total} ítems completados`
      );
    } else {
      markFail(
        `OT ${ot.consecutivo} finalizada con ítems pendientes (${d.pendientes})`
      );
    }
  }

  console.log('\n=== 5) Adicionales globales ===');
  const adics = await q(
    `SELECT id_adicional, usuario_id, empresa_id, tipo_actividad, adc_estado,
            id_order_work, id_ejecucion, item, contrato_no, orden_no
       FROM ejecucion_corte_adicional
      ORDER BY id_adicional`
  );
  console.table(adics);

  for (const a of adics) {
    const tag = `adic#${a.id_adicional}`;
    if (!a.usuario_id) markFail(`${tag} sin usuario_id (debe ser global por usuario)`);
    else ok(`${tag} usuario=${a.usuario_id}`);

    if (!a.empresa_id) warn(`${tag} sin empresa_id`);
    else ok(`${tag} empresa=${a.empresa_id}`);

    if (!a.tipo_actividad) warn(`${tag} sin tipo_actividad`);
    else ok(`${tag} tipo=${a.tipo_actividad}`);

    // Completado no debe depender de id_ejecucion/OT
    if (Number(a.adc_estado) === 2) {
      ok(
        `${tag} COMPLETADO (origen ADICIONAL) — amarrado a data digitada (empresa/tipo/contrato)`
      );
      if (a.id_ejecucion) {
        warn(
          `${tag} tiene id_ejecucion=${a.id_ejecucion} (opcionales; no es dueño del adicional)`
        );
      }
    } else {
      ok(`${tag} PENDIENTE`);
    }
  }

  console.log('\n=== 6) SP Completados (origen OT | ADICIONAL) ===');
  try {
    const [sets] = await c.query(
      'CALL SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION(?, ?)',
      [0, '']
    );
    const items = sets[0] || [];
    const otItems = items.filter((x) => x.origen === 'OT');
    const adItems = items.filter((x) => x.origen === 'ADICIONAL');
    ok(`completados total=${items.length} (OT=${otItems.length}, ADICIONAL=${adItems.length})`);
    console.table(
      items.map((r) => ({
        origen: r.origen,
        orden: r.orden_trabajo,
        item: r.item,
        empresa: r.empresa_asociada,
        id_order_work: r.id_order_work,
        id_adicional: r.id_adicional,
      }))
    );

    // Toda OT finalizada debe aparecer al menos 1 fila origen OT
    for (const ot of otFin) {
      const rows = otItems.filter((x) => x.id_order_work === ot.id_order_work);
      if (rows.length) ok(`completados incluye OT ${ot.consecutivo} (${rows.length} filas)`);
      else markFail(`completados NO incluye OT finalizada ${ot.consecutivo}`);
    }
  } catch (e) {
    markFail(`SP completados: ${e.message}`);
  }

  console.log('\n=== 7) Unique OT / empresa (riesgo duplicados) ===');
  const dups = await q(
    `SELECT consecutivo, COUNT(*) n,
            GROUP_CONCAT(CONCAT(id_order_work, ':', IFNULL(empresa_asociada_id,'NULL'), ':e', ot_estado)
                         ORDER BY id_order_work SEPARATOR ' | ') detail
       FROM order_work
      GROUP BY consecutivo
     HAVING COUNT(*) > 1`
  );
  if (!dups.length) ok('no hay consecutivos OT duplicados');
  else {
    warn('hay consecutivos OT repetidos (uk permite NULL empresa):');
    console.table(dups);
  }

  console.log('\n=== RESUMEN ===');
  if (fails === 0) console.log('DIAGNOSTICO OK — datos e integridad alineados al modelo actual.');
  else console.log(`DIAGNOSTICO CON ${fails} FALLO(S).`);

  await c.end();
  process.exitCode = fails ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
