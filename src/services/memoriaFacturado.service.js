/**
 * Fuente de verdad comercial de "Facturado" = memorias GUARDADA | FINALIZADA.
 * Desacoplado: si el escenario cambia (p. ej. Actas de Pago), solo se ajusta aquí.
 */

const ESTADOS_FACTURADO = Object.freeze(['GUARDADA', 'FINALIZADA']);

function queryAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

/**
 * Totales facturados por número de contrato (texto EAV).
 * @param {object} [opts]
 * @param {number|null} [opts.excludeMemoriaId] — al re-guardar, no contar la propia memoria
 * @returns {{ valor_facturado: number, cantidad_por_item: Record<string, number>, cantidad_por_remision_plano: Record<number, number> }}
 */
async function getFacturadoContrato(db, numeroContrato, opts = {}) {
  const numero = String(numeroContrato || '').trim();
  if (!numero) {
    return {
      valor_facturado: 0,
      cantidad_por_item: {},
      cantidad_por_remision_plano: {},
    };
  }

  const excludeId = Number(opts.excludeMemoriaId) || null;
  const placeholders = ESTADOS_FACTURADO.map(() => '?').join(',');
  const headers = await queryAsync(
    db,
    `SELECT id, IFNULL(valor_neto, 0) AS valor_neto
       FROM memoria_facturacion
      WHERE TRIM(numero_contrato) = ?
        AND estado IN (${placeholders})
        ${excludeId ? 'AND id <> ?' : ''}`,
    excludeId
      ? [numero, ...ESTADOS_FACTURADO, excludeId]
      : [numero, ...ESTADOS_FACTURADO]
  );

  let valor_facturado = 0;
  const ids = [];
  for (const h of headers || []) {
    valor_facturado += Number(h.valor_neto) || 0;
    ids.push(h.id);
  }

  const cantidad_por_item = {};
  const cantidad_por_remision_plano = {};

  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const details = await queryAsync(
      db,
      `SELECT item, remision_plano_id, cantidad_facturar
         FROM memoria_facturacion_detalle
        WHERE id_memoria IN (${ph})`,
      ids
    );
    for (const d of details || []) {
      const item = String(d.item || '').trim();
      const cant = Number(d.cantidad_facturar) || 0;
      if (item) {
        cantidad_por_item[item] = (cantidad_por_item[item] || 0) + cant;
      }
      const rid = Number(d.remision_plano_id);
      if (Number.isFinite(rid) && rid > 0) {
        cantidad_por_remision_plano[rid] =
          (cantidad_por_remision_plano[rid] || 0) + cant;
      }
    }
  }

  return { valor_facturado, cantidad_por_item, cantidad_por_remision_plano };
}

module.exports = {
  ESTADOS_FACTURADO,
  getFacturadoContrato,
};
