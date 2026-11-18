const db = require('../../config/db');

/**
 * Informe BALANCES POR CONTRATO
 * - Cabecera + montos desde contrato / actas de pago
 * - Ítems manuales persistidos en balance_contrato_item (adicional | presupuesto)
 * - MO / material real: sin fuente de costo en BD → 0 (UI muestra — o 0)
 */

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

const PRESUPUESTO_DEFAULTS = [
  'MANO DE OBRA',
  'MATERIAL',
  'OTROS COSTOS',
  'UTILIDAD PROYECTADA',
];

function cleanParam(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parseMoneda(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let s = String(value).trim().replace(/[$\s]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function roundPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function pctOf(part, total) {
  if (!total || total === 0) return 0;
  return roundPct((part / total) * 100);
}

function formatFechaDMY(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${value.getFullYear()}`;
  }
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const js = String(value).match(
    /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/
  );
  if (js) {
    const months = {
      Jan: '01',
      Feb: '02',
      Mar: '03',
      Apr: '04',
      May: '05',
      Jun: '06',
      Jul: '07',
      Aug: '08',
      Sep: '09',
      Oct: '10',
      Nov: '11',
      Dec: '12',
    };
    const mm = months[js[1]] || '01';
    return `${String(js[2]).padStart(2, '0')}/${mm}/${js[3]}`;
  }
  return String(value);
}

async function resolveContratoNumerodoc(numeroContrato) {
  let num = String(numeroContrato || '').trim();
  if (!num) return null;
  num = num
    .replace(/^(no\.?|n[ºo°]\.?|contrato)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!num) return null;

  const rows = await queryAsync(
    `SELECT TRIM(numerodoc) AS numerodoc
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
        AND (
          TRIM(numerodoc) = ?
          OR (nombre_campo_doc = 'numero_contrato' AND TRIM(valor_campo_doc) = ?)
          OR (nombre_campo_doc = 'tipo_doc_contratista' AND TRIM(valor_campo_doc) = ?)
        )
      LIMIT 1`,
    [num, num, num]
  );
  return rows?.[0]?.numerodoc ? String(rows[0].numerodoc).trim() : null;
}

async function loadContratoCabecera(numerodoc) {
  const rows = await queryAsync(
    `SELECT nombre_campo_doc, valor_campo_doc
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
        AND TRIM(numerodoc) = ?`,
    [numerodoc]
  );
  const map = {};
  for (const r of rows || []) {
    const k = String(r.nombre_campo_doc || '').trim();
    if (k) map[k] = r.valor_campo_doc;
  }
  return map;
}

async function loadValorContrato(numerodoc, eav) {
  const fromEav = parseMoneda(eav.valor_contrato);
  if (fromEav != null) return fromEav;
  const sumRows = await queryAsync(
    `SELECT SUM(IFNULL(vr_total, 0)) AS total
       FROM (
         SELECT vr_total FROM aiu WHERE TRIM(numdoc) = ?
         UNION ALL
         SELECT vr_total FROM iva_pleno WHERE TRIM(numdoc) = ?
       ) x`,
    [numerodoc, numerodoc]
  );
  return parseMoneda(sumRows?.[0]?.total) ?? 0;
}

async function loadEncargado(eav) {
  const id = cleanParam(eav.encargado_contrato);
  if (!id) return '';
  try {
    const rows = await queryAsync(
      `SELECT CONCAT(IFNULL(nombre, ''), ' ', IFNULL(apellido, '')) AS nombre
         FROM usuarios WHERE id_usuario = ? LIMIT 1`,
      [id]
    );
    return String(rows?.[0]?.nombre || '').trim();
  } catch {
    return '';
  }
}

/**
 * Totales de actas de pago (módulo + legado) por buckets.
 */
async function loadActasTotales(numerodoc, numeroContratoVisible) {
  const keys = [...new Set([numerodoc, numeroContratoVisible].filter(Boolean))];
  const placeholders = keys.map(() => '?').join(',');

  const actas2 = await queryAsync(
    `SELECT
        UPPER(TRIM(IFNULL(tipo_pago, ''))) AS tipo_pago,
        IFNULL(COALESCE(valor_a_pagar, valor_acta), 0) AS valor,
        IFNULL(total_descuentos, 0) AS descuentos,
        id
       FROM acta_pago
      WHERE UPPER(TRIM(estado)) <> 'ANULADA'
        AND (
          TRIM(numero_contrato) IN (${placeholders})
          OR TRIM(numerodoc_contrato) IN (${placeholders})
        )`,
    [...keys, ...keys]
  ).catch(() => []);

  let anticipo = 0;
  let rete = 0;
  let facturado = 0;
  let descuentosTotal = 0;
  const actaIds = [];

  for (const r of actas2 || []) {
    const t = String(r.tipo_pago || '');
    const v = roundMoney(r.valor);
    descuentosTotal = roundMoney(descuentosTotal + Number(r.descuentos || 0));
    if (r.id != null) actaIds.push(r.id);
    if (t.includes('ANTICIPO')) anticipo = roundMoney(anticipo + v);
    else if (t.includes('RETE')) rete = roundMoney(rete + v);
    else facturado = roundMoney(facturado + v);
  }

  // Incluir legado plano en facturado/pagado global
  const plano = await queryAsync(
    `SELECT SUM(IFNULL(vr_total_documento, 0)) AS total
       FROM actas_pago_plano
      WHERE TRIM(numero_contrato) IN (${placeholders})
         OR TRIM(numerodoc) IN (${placeholders})`,
    [...keys, ...keys]
  ).catch(() => []);
  const planoTotal = roundMoney(plano?.[0]?.total || 0);

  const pagadoModulo = roundMoney(anticipo + rete + facturado);
  const pagado = roundMoney(Math.max(pagadoModulo, planoTotal));

  let impuestos = 0;
  let otrosDescuentos = 0;
  if (actaIds.length) {
    const ph = actaIds.map(() => '?').join(',');
    const descRows = await queryAsync(
      `SELECT concepto, IFNULL(valor, 0) AS valor
         FROM acta_pago_descuento
        WHERE id_acta_pago IN (${ph})`,
      actaIds
    ).catch(() => []);
    for (const d of descRows || []) {
      const c = String(d.concepto || '').toUpperCase();
      const v = roundMoney(d.valor);
      if (c.includes('IMPUESTO') || c.includes('IVA') || c.includes('RETEFUENTE')) {
        impuestos = roundMoney(impuestos + v);
      } else {
        otrosDescuentos = roundMoney(otrosDescuentos + v);
      }
    }
  }
  if (!impuestos && !otrosDescuentos && descuentosTotal) {
    otrosDescuentos = descuentosTotal;
  }

  return {
    anticipo,
    retegarantia: rete,
    facturado: pagado,
    actas_pago_acumulado: pagado,
    impuestos,
    otros_descuentos: otrosDescuentos,
    descuentos_total: roundMoney(impuestos + otrosDescuentos),
  };
}

async function loadItems(numerodoc, itemType) {
  return queryAsync(
    `SELECT id, numerodoc, item_type, concepto, valor, porcentaje, sort_order, is_active
       FROM balance_contrato_item
      WHERE TRIM(numerodoc) = ?
        AND item_type = ?
        AND is_active = 1
      ORDER BY sort_order ASC, id ASC`,
    [numerodoc, itemType]
  );
}

async function ensurePresupuestoDefaults(numerodoc, userLabel) {
  const existing = await loadItems(numerodoc, 'presupuesto');
  if (existing?.length) return existing;
  for (let i = 0; i < PRESUPUESTO_DEFAULTS.length; i++) {
    await queryAsync(
      `INSERT INTO balance_contrato_item
         (numerodoc, item_type, concepto, valor, porcentaje, sort_order, is_active, created_by)
       VALUES (?, 'presupuesto', ?, 0, 0, ?, 1, ?)`,
      [numerodoc, PRESUPUESTO_DEFAULTS[i], i + 1, userLabel || null]
    );
  }
  return loadItems(numerodoc, 'presupuesto');
}

function mapItem(r) {
  return {
    id: r.id,
    concepto: r.concepto,
    valor: roundMoney(r.valor),
    porcentaje: r.porcentaje != null ? Number(r.porcentaje) : null,
    sort_order: r.sort_order,
  };
}

function buildDataset({
  numerodoc,
  eav,
  valorContrato,
  encargado,
  actas,
  adicionales,
  presupuesto,
}) {
  const numeroVisible =
    cleanParam(eav.numero_contrato) ||
    cleanParam(eav.tipo_doc_contratista) ||
    numerodoc;

  const costosAdicionales = roundMoney(
    adicionales.reduce((s, x) => s + Number(x.valor || 0), 0)
  );

  const findPres = (label) => {
    const hit = presupuesto.find(
      (p) => String(p.concepto || '').trim().toUpperCase() === label
    );
    return hit ? roundMoney(hit.valor) : 0;
  };

  const presMo = findPres('MANO DE OBRA');
  const presMaterial = findPres('MATERIAL');
  const presOtros = findPres('OTROS COSTOS');
  const presUtilidad = findPres('UTILIDAD PROYECTADA');

  // Sin costo real en BD: se usa presupuesto (y adicionales) como estimado operativo.
  const realMoBd = 0;
  const realMaterialBd = 0;
  const usaEstimadoMo = realMoBd <= 0 && presMo > 0;
  const usaEstimadoMaterial = realMaterialBd <= 0 && presMaterial > 0;
  const realMo = usaEstimadoMo ? presMo : realMoBd;
  const realMaterial = usaEstimadoMaterial ? presMaterial : realMaterialBd;
  const realOtros = roundMoney(
    costosAdicionales > 0 ? costosAdicionales : presOtros
  );
  const costosTotalesReal = roundMoney(realMo + realMaterial + realOtros);
  const utilidadReal = roundMoney(valorContrato - costosTotalesReal);
  const resultadoFinanciero = utilidadReal;

  const saldo = roundMoney(valorContrato - actas.facturado);

  const pct = (v) => pctOf(v, valorContrato);

  const adicionalesConPct = adicionales.map((a) => ({
    ...a,
    porcentaje: a.porcentaje != null ? Number(a.porcentaje) : pct(a.valor),
  }));

  const resumenGlobal = [
    { concepto: 'Valor Total Contrato', valor: valorContrato, pct: 100 },
    { concepto: 'Anticipo', valor: actas.anticipo, pct: pct(actas.anticipo) },
    {
      concepto: 'Actas de pago (acumulado)',
      valor: actas.actas_pago_acumulado,
      pct: pct(actas.actas_pago_acumulado),
    },
    { concepto: 'Mano de Obra', valor: realMo, pct: pct(realMo) },
    { concepto: 'Material Obra', valor: realMaterial, pct: pct(realMaterial) },
    {
      concepto: 'Descuentos',
      valor: actas.descuentos_total,
      pct: pct(actas.descuentos_total),
    },
    {
      concepto: 'Retegarantia',
      valor: actas.retegarantia,
      pct: pct(actas.retegarantia),
    },
    {
      concepto: 'Gastos Adicionales',
      valor: costosAdicionales,
      pct: pct(costosAdicionales),
    },
    { concepto: 'Saldo', valor: saldo, pct: pct(saldo) },
  ];

  const usoMaterial = [
    {
      concepto: 'Material desarrollo de obra',
      valor: realMaterial,
      pct: pct(realMaterial),
    },
  ];

  // Sin kardex con costo: composición provisional = material estimado + adicionales.
  const composicionMaterial = [
    realMaterial > 0
      ? {
          label: usaEstimadoMaterial
            ? 'Material (presupuesto)'
            : 'Material obra',
          valor: realMaterial,
          color: '#0f3550',
        }
      : null,
    costosAdicionales > 0
      ? {
          label: 'Gastos / costos adicionales',
          valor: costosAdicionales,
          color: '#4a90c8',
        }
      : null,
    actas.impuestos > 0
      ? { label: 'Impuestos', valor: actas.impuestos, color: '#3a9e6a' }
      : null,
  ]
    .filter(Boolean)
    .map((s) => {
      const base = realMaterial + costosAdicionales + actas.impuestos;
      return {
        ...s,
        pct: pctOf(s.valor, base > 0 ? base : 1),
      };
    });

  const pagosNeto = roundMoney(
    Math.max(0, actas.facturado - actas.descuentos_total)
  );
  const distribucion = [
    {
      label: 'Pagos realizados (neto)',
      valor: pagosNeto,
      pct: pct(pagosNeto),
      color: '#0f3550',
    },
    {
      label: 'Material utilizado (instalado)',
      valor: realMaterial,
      pct: pct(realMaterial),
      color: '#4a90c8',
    },
    {
      label: 'Mano de obra',
      valor: realMo,
      pct: pct(realMo),
      color: '#2e7d32',
    },
    {
      label: 'Costos adicionales',
      valor: costosAdicionales,
      pct: pct(costosAdicionales),
      color: '#fb8c00',
    },
    {
      label: 'Impuestos',
      valor: actas.impuestos,
      pct: pct(actas.impuestos),
      color: '#3a9e6a',
    },
    {
      label: 'Descuentos aplicados',
      valor: actas.otros_descuentos,
      pct: pct(actas.otros_descuentos),
      color: '#8a8a8a',
    },
  ].filter((s) => Number(s.valor) > 0);
  const distTotal = roundMoney(distribucion.reduce((s, x) => s + x.valor, 0));

  const descuentosDetalle = [
    {
      concepto: 'Impuestos',
      valor: actas.impuestos,
      pct: pct(actas.impuestos),
    },
    {
      concepto: 'Otros descuentos',
      valor: actas.otros_descuentos,
      pct: pct(actas.otros_descuentos),
    },
  ];

  const margenUtilidad =
    valorContrato > 0 ? pctOf(utilidadReal, valorContrato) : 0;
  const costoSobreContrato =
    valorContrato > 0 ? pctOf(costosTotalesReal, valorContrato) : 0;

  const desviacion = (real, pres) => {
    if (!pres) return real ? 100 : 0;
    return roundPct(((real - pres) / Math.abs(pres)) * 100);
  };

  const comparativo = [
    {
      concepto: 'MANO DE OBRA',
      presupuestado: presMo,
      real: realMo,
      desviacion: desviacion(realMo, presMo),
    },
    {
      concepto: 'MATERIAL',
      presupuestado: presMaterial,
      real: realMaterial,
      desviacion: desviacion(realMaterial, presMaterial),
    },
    {
      concepto: 'OTROS COSTOS',
      presupuestado: presOtros || costosAdicionales,
      real: realOtros,
      desviacion: desviacion(realOtros, presOtros || costosAdicionales),
    },
    {
      concepto: 'COSTOS TOTALES',
      presupuestado: roundMoney(presMo + presMaterial + (presOtros || 0)),
      real: costosTotalesReal,
      desviacion: desviacion(
        costosTotalesReal,
        roundMoney(presMo + presMaterial + (presOtros || 0))
      ),
      is_total: true,
    },
    {
      concepto: 'UTILIDAD',
      presupuestado: presUtilidad,
      real: utilidadReal,
      desviacion: desviacion(utilidadReal, presUtilidad),
      is_utilidad: true,
    },
  ];

  const kpis = [
    {
      id: 'valor_contrato',
      label: 'Valor Total del Contrato',
      valor: valorContrato,
      pct: null,
    },
    {
      id: 'facturado',
      label: 'Valor Facturado',
      valor: actas.facturado,
      pct: pct(actas.facturado),
    },
    {
      id: 'mano_obra',
      label: 'Mano de Obra',
      valor: realMo,
      pct: pct(realMo),
    },
    {
      id: 'material',
      label: 'Material Utilizado',
      valor: realMaterial,
      pct: pct(realMaterial),
    },
    {
      id: 'adicionales',
      label: 'Costos Adicionales',
      valor: costosAdicionales,
      pct: pct(costosAdicionales),
    },
    {
      id: 'resultado',
      label: 'Resultado Financiero',
      valor: resultadoFinanciero,
      pct: pct(resultadoFinanciero),
      sentido: resultadoFinanciero >= 0 ? 'favor' : 'contra',
    },
  ];

  return {
    columns: [],
    rows: [],
    meta: {
      reporte: 'Balance por contrato',
      contrato: {
        numerodoc,
        numero_contrato: numeroVisible,
        descripcion: cleanParam(eav.descripcion) || '',
        empresa: cleanParam(eav.empresa) || '',
        proyecto: cleanParam(eav.proyecto) || '',
        tipo_contrato: cleanParam(eav.tipo_contrato) || '',
        ciudad:
          cleanParam(eav.ciudad_empresa) ||
          cleanParam(eav.ciudad) ||
          cleanParam(eav.ubicacion) ||
          '',
        fecha_inicio: formatFechaDMY(eav.fecha_inicio),
        fecha_fin: formatFechaDMY(eav.fecha_fin),
        estado: cleanParam(eav.estado) || 'Activo',
        encargado,
        empresa_asociada: cleanParam(eav.empresa_asociada) || '1',
      },
      kpis,
      resumen_global: resumenGlobal,
      uso_material: usoMaterial,
      composicion_material: composicionMaterial,
      adicionales: adicionalesConPct,
      adicionales_total: {
        valor: costosAdicionales,
        pct: pct(costosAdicionales),
      },
      distribucion: {
        series: distribucion,
        total: { valor: distTotal, pct: pct(distTotal) },
      },
      descuentos: descuentosDetalle,
      indicadores: {
        utilidad: utilidadReal,
        margen_utilidad: margenUtilidad,
        costo_sobre_contrato: costoSobreContrato,
      },
      presupuesto,
      comparativo,
      notas: {
        mo_material:
          'Sin costo real en BD: MO/material usan el presupuesto proyectado cuando hay valor; adicionales alimentan costos y resultado.',
        usa_estimado_mo: usaEstimadoMo,
        usa_estimado_material: usaEstimadoMaterial,
      },
    },
  };
}

async function loadBalanceDataset(numeroContrato, userLabel) {
  const numerodoc = await resolveContratoNumerodoc(numeroContrato);
  if (!numerodoc) {
    const err = new Error(
      `No se encontró el contrato «${String(numeroContrato || '').trim()}» en la base de datos activa.`
    );
    err.isNotFound = true;
    throw err;
  }

  const eav = await loadContratoCabecera(numerodoc);
  const numeroVisible =
    cleanParam(eav.numero_contrato) ||
    cleanParam(eav.tipo_doc_contratista) ||
    numerodoc;
  const [valorContrato, encargado, actas, adicionales, presupuesto] =
    await Promise.all([
      loadValorContrato(numerodoc, eav),
      loadEncargado(eav),
      loadActasTotales(numerodoc, numeroVisible),
      loadItems(numerodoc, 'adicional'),
      ensurePresupuestoDefaults(numerodoc, userLabel),
    ]);

  return buildDataset({
    numerodoc,
    eav,
    valorContrato: roundMoney(valorContrato),
    encargado,
    actas,
    adicionales: (adicionales || []).map(mapItem),
    presupuesto: (presupuesto || []).map(mapItem),
  });
}

const getBalanceContratoPreview = async (req, res) => {
  try {
    const numeroContrato = cleanParam(req.query?.numero_contrato);
    if (!numeroContrato) {
      return res.status(400).json({
        code: 0,
        message: 'Digite el número de contrato para generar el balance.',
      });
    }
    const userLabel =
      cleanParam(req.user?.nombre) ||
      cleanParam(req.user?.usuario) ||
      cleanParam(req.user?.email) ||
      null;
    const data = await loadBalanceDataset(numeroContrato, userLabel);
    return res.status(200).json({ code: 1, message: 'OK', data });
  } catch (err) {
    if (err?.isNotFound) {
      return res.status(400).json({ code: 0, message: err.message });
    }
    console.error('Error Balance Contrato preview:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al generar el Balance por contrato.',
      error: err?.message,
    });
  }
};

/**
 * Body: { numero_contrato, adicionales?: [], presupuesto?: [] }
 * Reemplaza ítems activos del tipo enviado (soft-delete + insert).
 */
const saveBalanceContratoItems = async (req, res) => {
  try {
    const numeroContrato = cleanParam(req.body?.numero_contrato);
    if (!numeroContrato) {
      return res.status(400).json({
        code: 0,
        message: 'numero_contrato es requerido.',
      });
    }
    const numerodoc = await resolveContratoNumerodoc(numeroContrato);
    if (!numerodoc) {
      return res.status(400).json({
        code: 0,
        message: `No se encontró el contrato «${numeroContrato}».`,
      });
    }

    const userLabel =
      cleanParam(req.user?.nombre) ||
      cleanParam(req.user?.usuario) ||
      cleanParam(req.user?.email) ||
      null;

    const saveType = async (itemType, list) => {
      if (!Array.isArray(list)) return;
      await queryAsync(
        `UPDATE balance_contrato_item
            SET is_active = 0
          WHERE TRIM(numerodoc) = ? AND item_type = ? AND is_active = 1`,
        [numerodoc, itemType]
      );
      let order = 0;
      for (const raw of list) {
        let concepto = cleanParam(raw?.concepto);
        const valor = roundMoney(parseMoneda(raw?.valor) ?? Number(raw?.valor) ?? 0);
        if (!concepto && !(valor > 0)) continue;
        if (!concepto) concepto = 'Sin concepto';
        order += 1;
        const porcentajeRaw =
          raw?.porcentaje == null || raw?.porcentaje === ''
            ? null
            : Number(String(raw.porcentaje).replace(',', '.'));
        const porcentaje = Number.isFinite(porcentajeRaw) ? porcentajeRaw : null;
        await queryAsync(
          `INSERT INTO balance_contrato_item
             (numerodoc, item_type, concepto, valor, porcentaje, sort_order, is_active, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            numerodoc,
            itemType,
            concepto,
            valor,
            porcentaje,
            order,
            userLabel,
          ]
        );
      }
    };

    if (req.body?.adicionales !== undefined) {
      await saveType('adicional', req.body.adicionales);
    }
    if (req.body?.presupuesto !== undefined) {
      await saveType('presupuesto', req.body.presupuesto);
    }

    const data = await loadBalanceDataset(numeroContrato, userLabel);
    return res.status(200).json({ code: 1, message: 'Guardado', data });
  } catch (err) {
    console.error('Error save Balance Contrato:', err);
    return res.status(500).json({
      code: 0,
      message: 'Error al guardar ítems del balance.',
      error: err?.message,
    });
  }
};

module.exports = {
  getBalanceContratoPreview,
  saveBalanceContratoItems,
};
