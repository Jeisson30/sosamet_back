const db = require('../../config/db');

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

const normalizeLabel = (row, extraKeys = []) => {
  const numero = String(
    row.numero_contrato ??
      row.Numero_Contrato ??
      row.NUMERO_CONTRATO ??
      ''
  ).trim();
  if (!numero) return null;
  const extra =
    row.proyecto ?? row.constructora ?? extraKeys.find((k) => row[k]) ?? null;
  return {
    ...row,
    numero_contrato: numero,
    label: extra ? `${numero} — ${extra}` : numero,
    value: numero,
  };
};

/**
 * GET /api/contracts/contratos-filtrados?constructora=&proyecto=
 * Solo contratos cuya cabecera EAV coincide con constructora + proyecto.
 */
const consultarContratosFiltrados = async (req, res) => {
  try {
    const constructora = String(req.query?.constructora ?? '').trim() || null;
    const proyecto = String(req.query?.proyecto ?? '').trim() || null;

    if (!constructora || !proyecto) {
      return res.status(200).json({ data: [] });
    }

    const rows = await queryAsync(
      'CALL SP_CONSULTAR_CONTRATOS_FILTRADOS(?, ?)',
      [constructora, proyecto]
    );
    const list = Array.isArray(rows?.[0]) ? rows[0] : [];

    const data = list
      .map((row) => normalizeLabel(row))
      .filter(Boolean);

    return res.status(200).json({ data });
  } catch (error) {
    console.error('consultarContratosFiltrados:', error);
    return res.status(500).json({
      mensaje: 'Error al consultar contratos filtrados.',
      error: error.message,
    });
  }
};

const pivotContratoCabecera = async (numeroContrato) => {
  const rows = await queryAsync(
    `SELECT
        c.numerodoc,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'numero_contrato'
            THEN TRIM(c.valor_campo_doc) END) AS numero_contrato,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) IN ('empresa', 'constructora')
            THEN TRIM(c.valor_campo_doc) END) AS constructora,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'proyecto'
            THEN TRIM(c.valor_campo_doc) END) AS proyecto,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'tipo_contrato'
            THEN TRIM(c.valor_campo_doc) END) AS tipo_contrato,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'fecha_inicio'
            THEN TRIM(c.valor_campo_doc) END) AS fecha_inicio,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'fecha_fin'
            THEN TRIM(c.valor_campo_doc) END) AS fecha_fin,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'empresa_asociada'
            THEN TRIM(c.valor_campo_doc) END) AS empresa_asociada,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'tipo_doc_contratista'
            THEN TRIM(c.valor_campo_doc) END) AS tipo_doc_contratista,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'tipo_doc_catalogo'
            THEN TRIM(c.valor_campo_doc) END) AS tipo_doc_catalogo,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'encargado_contrato'
            THEN TRIM(c.valor_campo_doc) END) AS encargado_contrato,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'numero_cotizacion'
            THEN TRIM(c.valor_campo_doc) END) AS numero_cotizacion
      FROM item_documentos c
      INNER JOIN item_documentos nc
        ON nc.numerodoc = c.numerodoc
       AND UPPER(TRIM(nc.tipo_doc)) = 'CONTRATO'
       AND LOWER(nc.nombre_campo_doc) = 'numero_contrato'
       AND TRIM(nc.valor_campo_doc) = ?
      WHERE UPPER(TRIM(c.tipo_doc)) = 'CONTRATO'
      GROUP BY c.numerodoc
      LIMIT 1`,
    [numeroContrato]
  );

  return rows?.[0] ?? null;
};

const loadItemsContrato = async (numerodoc) => {
  if (!numerodoc) return [];

  let aiu = [];
  let iva = [];
  try {
    aiu = await queryAsync(
      `SELECT
          TRIM(item) AS item,
          TRIM(descripcion) AS detalle,
          cant AS cantidad_contratada,
          TRIM(und) AS um,
          ancho AS ancho_contrato,
          alto AS alto_contrato
        FROM aiu
        WHERE numdoc = ?
          AND TRIM(IFNULL(item, '')) <> ''`,
      [numerodoc]
    );
  } catch (_) {
    aiu = [];
  }
  try {
    iva = await queryAsync(
      `SELECT
          TRIM(item) AS item,
          TRIM(descripcion) AS detalle,
          cant AS cantidad_contratada,
          TRIM(und) AS um,
          ancho AS ancho_contrato,
          alto AS alto_contrato
        FROM iva_pleno
        WHERE numdoc = ?
          AND TRIM(IFNULL(item, '')) <> ''`,
      [numerodoc]
    );
  } catch (_) {
    iva = [];
  }

  return [...(aiu || []), ...(iva || [])].map((r) => ({
    item: String(r.item ?? '').trim(),
    detalle: String(r.detalle ?? '').trim(),
    cantidad_contratada:
      r.cantidad_contratada != null ? Number(r.cantidad_contratada) : null,
    um: String(r.um ?? '').trim(),
    ancho_contrato: r.ancho_contrato != null ? Number(r.ancho_contrato) : null,
    alto_contrato: r.alto_contrato != null ? Number(r.alto_contrato) : null,
  }));
};

/** Une plano AIU/IVA con ítems ya medidos en actas (p. ej. manuales). */
const mergeItemsContratoConActas = (
  itemsContrato,
  acumuladoActas,
  actasAnteriores
) => {
  const byItem = new Map();
  for (const it of itemsContrato || []) {
    const key = String(it.item ?? '').trim();
    if (key) byItem.set(key, it);
  }

  const findInHistorial = (key) => {
    for (const acta of actasAnteriores || []) {
      for (const row of acta.items || []) {
        if (String(row.item ?? '').trim() === key) return row;
      }
    }
    return null;
  };

  for (const ac of acumuladoActas || []) {
    const key = String(ac.item ?? '').trim();
    if (!key || byItem.has(key)) continue;
    const hist = findInHistorial(key);
    byItem.set(key, {
      item: key,
      detalle: String(hist?.detalle ?? '').trim(),
      cantidad_contratada: null,
      um: String(hist?.um ?? '').trim(),
      ancho_contrato: null,
      alto_contrato: null,
    });
  }

  const contractKeys = new Set(
    (itemsContrato || []).map((it) => String(it.item ?? '').trim()).filter(Boolean)
  );
  const extras = [];
  for (const [key, row] of byItem.entries()) {
    if (!contractKeys.has(key)) extras.push(row);
  }

  return [...(itemsContrato || []), ...extras];
};

const loadAcumuladoActas = async (numeroContrato, tipoVinculo) => {
  const rows = await queryAsync(
    `SELECT
        TRIM(amd.amd_item) AS item,
        SUM(COALESCE(amd.amd_cantidad, 0)) AS cantidad_acumulada
      FROM actas_medida_detalle amd
      LEFT JOIN item_documentos est
        ON est.numerodoc = amd.amd_consecutivo
       AND LOWER(est.nombre_campo_doc) = 'estado'
      WHERE TRIM(amd.amd_numero_contrato) = ?
        AND UPPER(TRIM(amd.amd_tipo_vinculo)) = ?
        AND (est.valor_campo_doc IS NULL OR TRIM(est.valor_campo_doc) <> '3')
      GROUP BY TRIM(amd.amd_item)`,
    [numeroContrato, tipoVinculo]
  );

  return (rows || []).map((r) => ({
    item: String(r.item ?? '').trim(),
    cantidad_acumulada:
      r.cantidad_acumulada != null ? Number(r.cantidad_acumulada) : 0,
  }));
};

const loadActasAnteriores = async (numeroContrato, tipoVinculo) => {
  const rows = await queryAsync(
    `SELECT
        amd.amd_consecutivo AS consecutivo,
        amd.amd_item AS item,
        amd.amd_detalle AS detalle,
        amd.amd_cantidad AS cantidad,
        amd.amd_unidad_medida AS um,
        amd.amd_ancho AS ancho,
        amd.amd_alto AS alto,
        amd.amd_fondo AS fondo,
        amd.amd_observaciones AS observaciones,
        MAX(CASE
          WHEN LOWER(f.nombre_campo_doc) IN ('fecha_acta', 'am_fecha_acta', 'fecha acta')
          THEN TRIM(f.valor_campo_doc)
        END) AS fecha_acta
      FROM actas_medida_detalle amd
      LEFT JOIN item_documentos est
        ON est.numerodoc = amd.amd_consecutivo
       AND LOWER(est.nombre_campo_doc) = 'estado'
      LEFT JOIN item_documentos f
        ON f.numerodoc = amd.amd_consecutivo
       AND LOWER(f.nombre_campo_doc) IN ('fecha_acta', 'am_fecha_acta', 'fecha acta')
      WHERE TRIM(amd.amd_numero_contrato) = ?
        AND UPPER(TRIM(amd.amd_tipo_vinculo)) = ?
        AND (est.valor_campo_doc IS NULL OR TRIM(est.valor_campo_doc) <> '3')
      GROUP BY
        amd.amd_id,
        amd.amd_consecutivo,
        amd.amd_item,
        amd.amd_detalle,
        amd.amd_cantidad,
        amd.amd_unidad_medida,
        amd.amd_ancho,
        amd.amd_alto,
        amd.amd_fondo,
        amd.amd_observaciones
      ORDER BY amd.amd_consecutivo DESC, amd.amd_item`,
    [numeroContrato, tipoVinculo]
  );

  const byConsecutivo = new Map();
  for (const r of rows || []) {
    const key = String(r.consecutivo ?? '').trim();
    if (!key) continue;
    if (!byConsecutivo.has(key)) {
      byConsecutivo.set(key, {
        consecutivo: key,
        fecha_acta: r.fecha_acta ?? null,
        archivo_acta: null,
        items: [],
      });
    }
    const group = byConsecutivo.get(key);
    if (!group.fecha_acta && r.fecha_acta) {
      group.fecha_acta = r.fecha_acta;
    }
    group.items.push({
      item: r.item ?? null,
      detalle: r.detalle ?? null,
      cantidad: r.cantidad != null ? Number(r.cantidad) : null,
      um: r.um ?? null,
      ancho: r.ancho != null ? Number(r.ancho) : null,
      alto: r.alto != null ? Number(r.alto) : null,
      fondo: r.fondo != null ? Number(r.fondo) : null,
      observaciones: r.observaciones ?? null,
    });
  }

  const consecutivos = Array.from(byConsecutivo.keys());
  if (consecutivos.length) {
    const placeholders = consecutivos.map(() => '?').join(',');
    const archivos = await queryAsync(
      `SELECT TRIM(numerodoc) AS consecutivo,
              TRIM(valor_campo_doc) AS archivo_acta
         FROM item_documentos
        WHERE tipo_doc = 'ACTAS DE MEDIDA'
          AND nombre_campo_doc = 'archivo_acta'
          AND TRIM(numerodoc) IN (${placeholders})
          AND valor_campo_doc IS NOT NULL
          AND TRIM(valor_campo_doc) <> ''`,
      consecutivos
    );
    for (const a of archivos || []) {
      const key = String(a.consecutivo ?? '').trim();
      const group = byConsecutivo.get(key);
      if (group && a.archivo_acta) {
        group.archivo_acta = String(a.archivo_acta).trim();
      }
    }
  }

  return Array.from(byConsecutivo.values());
};

/** Grilla editable por contrato (ancho/alto/fondo/obs — no es el acta AM-xxxx). */
const loadGrillaContrato = async (numeroContrato) => {
  try {
    const rows = await queryAsync(
      `SELECT TRIM(item) AS item,
              TRIM(IFNULL(detalle, '')) AS detalle,
              TRIM(IFNULL(unidad_medida, '')) AS um,
              ancho, alto, fondo, observaciones
         FROM contrato_grilla_acta
        WHERE TRIM(numero_contrato) = ?`,
      [numeroContrato]
    );
    return (rows || []).map((r) => ({
      item: String(r.item ?? '').trim(),
      detalle: String(r.detalle ?? '').trim(),
      um: String(r.um ?? '').trim(),
      ancho: r.ancho != null ? Number(r.ancho) : null,
      alto: r.alto != null ? Number(r.alto) : null,
      fondo: r.fondo != null ? Number(r.fondo) : null,
      observaciones: String(r.observaciones ?? ''),
    }));
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
};

const mergeItemsContratoConGrilla = (items, grilla) => {
  const byItem = new Map();
  for (const it of items || []) {
    const key = String(it.item ?? '').trim();
    if (key) byItem.set(key, it);
  }
  const planoKeys = new Set(byItem.keys());
  for (const g of grilla || []) {
    const key = String(g.item ?? '').trim();
    if (!key || byItem.has(key)) continue;
    byItem.set(key, {
      item: key,
      detalle: g.detalle || '',
      cantidad_contratada: null,
      um: g.um || '',
      ancho_contrato: null,
      alto_contrato: null,
    });
  }
  const extras = [];
  for (const [key, row] of byItem.entries()) {
    if (!planoKeys.has(key)) extras.push(row);
  }
  return [...(items || []), ...extras];
};

/**
 * POST /api/contracts/grilla-acta-contrato
 * Body: { numero_contrato, filas: [{ item, detalle?, um?, ancho?, alto?, fondo?, observaciones? }] }
 */
const upsertGrillaActaContrato = async (req, res) => {
  try {
    const numeroContrato = String(req.body?.numero_contrato ?? '').trim();
    const filas = Array.isArray(req.body?.filas) ? req.body.filas : [];

    if (!numeroContrato) {
      return res.status(400).json({ mensaje: 'numero_contrato es obligatorio.' });
    }

    if (!filas.length) {
      return res.status(200).json({
        mensaje: 'Sin datos de grilla que guardar.',
        filas: 0,
      });
    }

    for (const row of filas) {
      const item = String(row?.item ?? '').trim();
      if (!item) continue;

      await queryAsync(
        `INSERT INTO contrato_grilla_acta
          (numero_contrato, item, detalle, unidad_medida, ancho, alto, fondo, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          detalle = VALUES(detalle),
          unidad_medida = VALUES(unidad_medida),
          ancho = VALUES(ancho),
          alto = VALUES(alto),
          fondo = VALUES(fondo),
          observaciones = VALUES(observaciones)`,
        [
          numeroContrato,
          item,
          String(row?.detalle ?? '').trim() || null,
          String(row?.um ?? row?.unidad_medida ?? '').trim() || null,
          row?.ancho != null && row?.ancho !== '' ? Number(row.ancho) : null,
          row?.alto != null && row?.alto !== '' ? Number(row.alto) : null,
          row?.fondo != null && row?.fondo !== '' ? Number(row.fondo) : null,
          String(row?.observaciones ?? '').trim() || null,
        ]
      );
    }

    return res.status(200).json({
      mensaje: 'Grilla del contrato actualizada.',
      filas: filas.length,
    });
  } catch (error) {
    console.error('upsertGrillaActaContrato:', error);
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(200).json({
        mensaje: 'Grilla no disponible (tabla pendiente de instalar).',
        filas: 0,
      });
    }
    return res.status(500).json({
      mensaje: 'Error al guardar la grilla del contrato.',
      error: error.message,
    });
  }
};

/**
 * GET /api/contracts/contexto-acta-medida?numero_contrato=&tipo_vinculo=CONTRATO
 */
const getContextoActaMedida = async (req, res) => {
  try {
    const numeroContrato = String(req.query?.numero_contrato ?? '').trim();
    const tipoVinculoRaw = String(req.query?.tipo_vinculo ?? 'CONTRATO')
      .trim()
      .toUpperCase();
    const tipoVinculo =
      tipoVinculoRaw === 'COTIZACION' ? 'COTIZACION' : 'CONTRATO';

    if (!numeroContrato) {
      return res.status(400).json({
        mensaje: 'numero_contrato es obligatorio.',
      });
    }

    const cabecera = await pivotContratoCabecera(numeroContrato);
    const numerodoc = cabecera?.numerodoc ?? null;

    const [itemsPlano, acumulado_actas, actas_anteriores, grilla_estado] =
      await Promise.all([
        loadItemsContrato(numerodoc),
        loadAcumuladoActas(numeroContrato, tipoVinculo),
        loadActasAnteriores(numeroContrato, tipoVinculo),
        loadGrillaContrato(numeroContrato),
      ]);

    const mergedActas = mergeItemsContratoConActas(
      itemsPlano,
      acumulado_actas,
      actas_anteriores
    );
    const items_contrato = mergeItemsContratoConGrilla(
      mergedActas,
      grilla_estado
    );

    return res.status(200).json({
      cabecera: cabecera || { numero_contrato: numeroContrato },
      items_contrato,
      acumulado_actas,
      actas_anteriores,
      grilla_estado,
    });
  } catch (error) {
    console.error('getContextoActaMedida:', error);
    return res.status(500).json({
      mensaje: 'Error al cargar contexto del acta de medida.',
      error: error.message,
    });
  }
};

module.exports = {
  consultarContratosFiltrados,
  getContextoActaMedida,
  upsertGrillaActaContrato,
};
