const db = require('../../config/db');
const {
  puedeEditarMemorias,
  puedeVerValoresContrato,
  aplicarRestriccionValores,
} = require('../../utils/permissions');
const { getFacturadoContrato } = require('../../services/memoriaFacturado.service');

/** Editores de Memorias (p. ej. Contabilidad) ven montos en este módulo. */
const withMemoriaValues = (user, payload) => {
  if (puedeEditarMemorias(user) || puedeVerValoresContrato(user)) return payload;
  return aplicarRestriccionValores(user, payload);
};

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

/** AIU guarda 0.09 = 9%. UI y calcTotales usan escala 0–100. */
const toPercentUi = (v) => {
  const n = toNum(v);
  if (n > 0 && n <= 1) return Number((n * 100).toFixed(4));
  return n;
};

const requireEditor = (req, res) => {
  if (!puedeEditarMemorias(req.user)) {
    res.status(403).json({ mensaje: 'No tiene permiso para editar Memorias.' });
    return false;
  }
  return true;
};

async function nextConsecutivo() {
  const rows = await queryAsync(
    `SELECT consecutivo FROM memoria_facturacion
      WHERE consecutivo LIKE 'MEM-%'
      ORDER BY id DESC LIMIT 1`
  );
  const last = rows?.[0]?.consecutivo || '';
  const m = String(last).match(/MEM-(\d+)/i);
  const n = m ? Number(m[1]) + 1 : 1;
  return `MEM-${String(n).padStart(4, '0')}`;
}

/** EAV guarda id; al usuario se muestra el nombre. */
async function resolveEmpresaNombre(idOrName) {
  const v = String(idOrName ?? '').trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return v;
  const rows = await queryAsync(
    `SELECT nombre_empresa FROM empresa WHERE id = ? LIMIT 1`,
    [Number(v)]
  );
  return rows?.[0]?.nombre_empresa || v;
}

async function resolveEncargadoNombre(idOrName) {
  const v = String(idOrName ?? '').trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return v;
  const rows = await queryAsync(
    `SELECT TRIM(CONCAT(IFNULL(nombre,''), ' ', IFNULL(apellido,''))) AS nom
       FROM usuarios WHERE id_usuario = ? LIMIT 1`,
    [Number(v)]
  );
  const n = String(rows?.[0]?.nom || '').trim();
  return n || v;
}

async function withResolvedContratoLabels(cabecera) {
  if (!cabecera) return cabecera;
  const [empresa_asociada, encargado_contrato] = await Promise.all([
    resolveEmpresaNombre(cabecera.empresa_asociada),
    resolveEncargadoNombre(cabecera.encargado_contrato),
  ]);
  return {
    ...cabecera,
    empresa_asociada_id: cabecera.empresa_asociada,
    encargado_contrato_id: cabecera.encargado_contrato,
    empresa_asociada,
    encargado_contrato,
  };
}

async function pivotContratoByNumero(numeroContrato) {
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
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'encargado_contrato'
            THEN TRIM(c.valor_campo_doc) END) AS encargado_contrato,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) = 'numero_cotizacion'
            THEN TRIM(c.valor_campo_doc) END) AS numero_cotizacion,
        MAX(CASE WHEN LOWER(c.nombre_campo_doc) IN ('descripcion', 'objeto')
            THEN TRIM(c.valor_campo_doc) END) AS descripcion,
        MAX(CASE WHEN c.nombre_campo_doc IN ('Valor anticipo', 'valor_anticipo')
            THEN TRIM(c.valor_campo_doc) END) AS valor_anticipo
      FROM item_documentos c
      INNER JOIN item_documentos nc
        ON nc.numerodoc = c.numerodoc
       AND UPPER(TRIM(nc.tipo_doc)) = 'CONTRATO'
       AND LOWER(nc.nombre_campo_doc) = 'numero_contrato'
       AND TRIM(nc.valor_campo_doc) = ?
      WHERE UPPER(TRIM(c.tipo_doc)) = 'CONTRATO'
      GROUP BY c.numerodoc
      LIMIT 1`,
    [String(numeroContrato).trim()]
  );
  return rows?.[0] || null;
}

async function loadContratoItems(numerodoc) {
  if (!numerodoc) return [];
  const aiu = await queryAsync(
    `SELECT TRIM(item) AS item, TRIM(IFNULL(insumo,'')) AS insumo,
            TRIM(descripcion) AS detalle, TRIM(und) AS um,
            cant AS cantidad_contratada,
            valor_base, porc_adm, porc_imp, porc_ut, porc_iva, vr_total,
            'AIU' AS origen
       FROM aiu WHERE numdoc = ? AND TRIM(IFNULL(item,'')) <> ''`,
    [numerodoc]
  );
  const iva = await queryAsync(
    `SELECT TRIM(item) AS item, TRIM(IFNULL(insumo,'')) AS insumo,
            TRIM(descripcion) AS detalle, TRIM(und) AS um,
            cant AS cantidad_contratada,
            valor_base, NULL AS porc_adm, NULL AS porc_imp, NULL AS porc_ut,
            porc_iva, vr_total, 'IVA_PLENO' AS origen
       FROM iva_pleno WHERE numdoc = ? AND TRIM(IFNULL(item,'')) <> ''`,
    [numerodoc]
  );
  const map = new Map();
  for (const row of [...(aiu || []), ...(iva || [])]) {
    const key = String(row.item || '').trim();
    if (!key || map.has(key)) continue;
    const cant = toNum(row.cantidad_contratada);
    const base = toNum(row.valor_base);
    map.set(key, {
      item: key,
      insumo: row.insumo,
      detalle: row.detalle,
      um: row.um,
      cantidad_contratada: cant,
      valor_unitario: cant > 0 ? base / cant : base,
      valor_base: base,
      porc_adm: toNum(row.porc_adm),
      porc_imp: toNum(row.porc_imp),
      porc_ut: toNum(row.porc_ut),
      porc_iva: toNum(row.porc_iva),
      vr_total: toNum(row.vr_total),
      origen: row.origen,
    });
  }
  return [...map.values()];
}

async function loadRemisionesContrato(filtros) {
  const { constructora, proyecto, numero_contrato } = filtros;
  const rows = await queryAsync(
    `SELECT
        r.id AS remision_plano_id,
        r.numerodoc AS remision_numerodoc,
        r.item,
        r.cantidad,
        r.um,
        r.detalle,
        r.observaciones,
        r.fecha_creacion,
        d.remision_material,
        d.fecha_remision,
        d.numero_contrato,
        d.constructora,
        d.proyecto,
        d.tipo_doc_rem
      FROM remisiones_plano r
      INNER JOIN (
        SELECT
          numerodoc,
          MAX(CASE WHEN nombre_campo_doc = 'remision_material' THEN valor_campo_doc END) AS remision_material,
          MAX(CASE WHEN nombre_campo_doc = 'fecha_remision' THEN valor_campo_doc END) AS fecha_remision,
          MAX(CASE WHEN nombre_campo_doc = 'numero_contrato' THEN valor_campo_doc END) AS numero_contrato,
          MAX(CASE WHEN nombre_campo_doc = 'cliente' THEN valor_campo_doc END) AS constructora,
          MAX(CASE WHEN nombre_campo_doc = 'proyecto' THEN valor_campo_doc END) AS proyecto,
          MAX(CASE WHEN nombre_campo_doc = 'tipo_doc_rem' THEN valor_campo_doc END) AS tipo_doc_rem
        FROM item_documentos
        WHERE UPPER(TRIM(tipo_doc)) = 'REMISIONES'
        GROUP BY numerodoc
      ) d ON d.numerodoc = r.numerodoc
     WHERE TRIM(IFNULL(d.numero_contrato,'')) = ?
       AND (? IS NULL OR TRIM(IFNULL(d.constructora,'')) = ?)
       AND (? IS NULL OR TRIM(IFNULL(d.proyecto,'')) = ?)
     ORDER BY r.fecha_creacion DESC, r.id DESC`,
    [
      String(numero_contrato).trim(),
      constructora || null,
      constructora || null,
      proyecto || null,
      proyecto || null,
    ]
  );
  return rows || [];
}

/**
 * GET /api/contracts/memorias/contexto
 * ?constructora=&proyecto=&numero_contrato=&tipo_documento=
 */
const getContexto = async (req, res) => {
  try {
    const constructora = String(req.query.constructora || '').trim();
    const proyecto = String(req.query.proyecto || '').trim();
    const numero_contrato = String(req.query.numero_contrato || '').trim();
    const tipo_documento = String(req.query.tipo_documento || '').trim();

    if (!numero_contrato) {
      return res.status(400).json({ mensaje: 'Indique el N° de documento (contrato).' });
    }

    const cabeceraRaw = await pivotContratoByNumero(numero_contrato);
    if (!cabeceraRaw) {
      return res.status(404).json({ mensaje: 'Contrato no encontrado.' });
    }
    const cabecera = await withResolvedContratoLabels(cabeceraRaw);

    if (constructora && String(cabecera.constructora || '').trim() !== constructora) {
      return res.status(404).json({ mensaje: 'El contrato no coincide con la constructora.' });
    }
    if (proyecto && String(cabecera.proyecto || '').trim() !== proyecto) {
      return res.status(404).json({ mensaje: 'El contrato no coincide con el proyecto.' });
    }

    const items = await loadContratoItems(cabecera.numerodoc);
    const facturado = await getFacturadoContrato(db, numero_contrato);
    const remisionesRaw = await loadRemisionesContrato({
      constructora: constructora || cabecera.constructora,
      proyecto: proyecto || cabecera.proyecto,
      numero_contrato,
    });

    const remisiones = remisionesRaw.map((r) => {
      const enviada = toNum(r.cantidad);
      const ya = facturado.cantidad_por_remision_plano[Number(r.remision_plano_id)] || 0;
      const pendiente = Math.max(0, enviada - ya);
      return {
        remision_plano_id: r.remision_plano_id,
        remision_numerodoc: r.remision_numerodoc,
        remision_material: r.remision_material,
        fecha: r.fecha_remision || r.fecha_creacion,
        item: String(r.item || '').trim(),
        detalle: r.detalle,
        cantidad_enviada: enviada,
        cantidad_ya_facturada: ya,
        cantidad_pendiente: pendiente,
        cantidad_a_facturar: pendiente,
        diferencia: 0,
        um: r.um,
        locacion: '',
        observaciones: r.observaciones || '',
      };
    });

    let valorInicial = 0;
    for (const it of items) valorInicial += toNum(it.vr_total);
    const acumuladoAnterior = facturado.valor_facturado;
    const saldo = Math.max(0, valorInicial - acumuladoAnterior);
    const pct = valorInicial > 0 ? (acumuladoAnterior / valorInicial) * 100 : 0;

    const control = items.map((it) => {
      const acumCant = facturado.cantidad_por_item[it.item] || 0;
      return {
        ...it,
        acumulado_anterior_cant: acumCant,
        acumulado_anterior_valor: acumCant * toNum(it.valor_unitario),
        cant_acta: 0,
        vr_parcial: 0,
        acumulado_total_cant: acumCant,
        pct_ejecucion:
          toNum(it.cantidad_contratada) > 0
            ? (acumCant / toNum(it.cantidad_contratada)) * 100
            : 0,
      };
    });

    const pctDefaults = items.find((i) => i.origen === 'AIU') || items[0] || {};

    const payload = {
      contrato: {
        numerodoc: cabecera.numerodoc,
        numero_contrato: cabecera.numero_contrato,
        constructora: cabecera.constructora,
        proyecto: cabecera.proyecto,
        tipo_documento: tipo_documento || cabecera.tipo_contrato,
        tipo_contrato: cabecera.tipo_contrato,
        fecha_inicio: cabecera.fecha_inicio,
        fecha_fin: cabecera.fecha_fin,
        empresa_asociada: cabecera.empresa_asociada,
        empresa_asociada_id: cabecera.empresa_asociada_id ?? null,
        encargado_contrato: cabecera.encargado_contrato,
        numero_cotizacion: cabecera.numero_cotizacion,
        descripcion: cabecera.descripcion,
        valor_anticipo: toNum(cabecera.valor_anticipo),
      },
      resumen: {
        valor_inicial: valorInicial,
        acumulado_anterior: acumuladoAnterior,
        saldo_por_ejecutar: saldo,
        pct_ejecutado: Number(pct.toFixed(2)),
      },
      porcentajes: {
        porc_adm: toPercentUi(pctDefaults.porc_adm),
        porc_imp: toPercentUi(pctDefaults.porc_imp),
        porc_ut: toPercentUi(pctDefaults.porc_ut),
        porc_iva: toPercentUi(pctDefaults.porc_iva),
        porc_amort_anticipo: 0,
        porc_rete_garantia: 0,
      },
      remisiones,
      control,
      siguiente_consecutivo: await nextConsecutivo(),
      fecha_ultimo_corte: null,
    };

    const ult = await queryAsync(
      `SELECT fecha_acta FROM memoria_facturacion
        WHERE TRIM(numero_contrato) = ?
          AND estado IN ('GUARDADA','FINALIZADA')
        ORDER BY fecha_acta DESC, id DESC LIMIT 1`,
      [numero_contrato]
    );
    if (ult?.[0]?.fecha_acta) {
      payload.fecha_ultimo_corte = ult[0].fecha_acta;
    }

    return res.status(200).json(withMemoriaValues(req.user, payload));
  } catch (error) {
    console.error('memorias.getContexto:', error);
    return res.status(500).json({
      mensaje: 'Error al cargar contexto de Memorias.',
      error: error.message,
    });
  }
};

const listar = async (req, res) => {
  try {
    const buscar = String(req.query.buscar || '').trim();
    const estado = String(req.query.estado || '').trim().toUpperCase();
    const constructora = String(req.query.constructora || '').trim();
    const proyecto = String(req.query.proyecto || '').trim();
    const empresa = String(req.query.empresa_asociada || '').trim();
    const fechaDesde = String(req.query.fecha_desde || '').trim();
    const fechaHasta = String(req.query.fecha_hasta || '').trim();

    const where = ['1=1'];
    const params = [];

    if (buscar) {
      where.push(`(
        consecutivo LIKE CONCAT('%', ?, '%')
        OR numero_contrato LIKE CONCAT('%', ?, '%')
        OR constructora LIKE CONCAT('%', ?, '%')
        OR proyecto LIKE CONCAT('%', ?, '%')
        OR IFNULL(empresa_asociada,'') LIKE CONCAT('%', ?, '%')
      )`);
      params.push(buscar, buscar, buscar, buscar, buscar);
    }
    if (constructora) {
      where.push(`TRIM(IFNULL(constructora,'')) = ?`);
      params.push(constructora);
    }
    if (proyecto) {
      where.push(`TRIM(IFNULL(proyecto,'')) = ?`);
      params.push(proyecto);
    }
    if (empresa) {
      where.push(`TRIM(IFNULL(empresa_asociada,'')) = ?`);
      params.push(empresa);
    }
    if (fechaDesde) {
      where.push(`fecha_acta >= ?`);
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      where.push(`fecha_acta <= ?`);
      params.push(fechaHasta);
    }

    // EN_PROCESO = BORRADOR + GUARDADA (mockup)
    if (estado === 'EN_PROCESO') {
      where.push(`estado IN ('BORRADOR','GUARDADA')`);
    } else if (estado === 'FINALIZADO' || estado === 'FINALIZADA') {
      where.push(`estado = 'FINALIZADA'`);
    } else if (estado === 'ANULADA' || estado === 'ANULADO') {
      where.push(`estado = 'ANULADA'`);
    } else if (estado) {
      where.push(`estado = ?`);
      params.push(estado);
    }

    const rows = await queryAsync(
      `SELECT id, consecutivo, numero_contrato, constructora, proyecto,
              empresa_asociada, tipo_documento, fecha_acta, estado,
              valor_neto, fecha_creacion
         FROM memoria_facturacion
        WHERE ${where.join(' AND ')}
        ORDER BY id DESC
        LIMIT 300`,
      params
    );
    const data = [];
    for (const row of rows || []) {
      data.push({
        ...row,
        empresa_asociada: await resolveEmpresaNombre(row.empresa_asociada),
      });
    }
    return res.status(200).json({
      data: withMemoriaValues(req.user, data),
    });
  } catch (error) {
    console.error('memorias.listar:', error);
    return res.status(500).json({ mensaje: 'Error al listar memorias.', error: error.message });
  }
};

const obtener = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ mensaje: 'Id inválido.' });
    }
    const headers = await queryAsync(
      `SELECT * FROM memoria_facturacion WHERE id = ? LIMIT 1`,
      [id]
    );
    const headerRaw = headers?.[0];
    if (!headerRaw) return res.status(404).json({ mensaje: 'Memoria no encontrada.' });
    const detalle = await queryAsync(
      `SELECT * FROM memoria_facturacion_detalle WHERE id_memoria = ? ORDER BY id`,
      [id]
    );
    const header = {
      ...headerRaw,
      empresa_asociada: await resolveEmpresaNombre(headerRaw.empresa_asociada),
    };
    // Encargado vive en el contrato EAV; enriquecer si hay número de contrato
    if (header.numero_contrato) {
      const cab = await pivotContratoByNumero(header.numero_contrato);
      if (cab) {
        header.encargado_contrato = await resolveEncargadoNombre(
          cab.encargado_contrato
        );
        if (!header.empresa_asociada || /^\d+$/.test(String(header.empresa_asociada))) {
          header.empresa_asociada = await resolveEmpresaNombre(
            cab.empresa_asociada
          );
        }
      }
    }
    return res.status(200).json(
      withMemoriaValues(req.user, { header, detalle: detalle || [] })
    );
  } catch (error) {
    console.error('memorias.obtener:', error);
    return res.status(500).json({ mensaje: 'Error al obtener memoria.', error: error.message });
  }
};

function serializeEvidencias(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const clean = raw
    .map((e) => ({
      item: String(e?.item || '').trim(),
      detalle: String(e?.detalle || '').trim(),
      observaciones: String(e?.observaciones || '').trim(),
    }))
    .filter((e) => e.item || e.detalle || e.observaciones);
  return clean.length ? JSON.stringify(clean) : null;
}

function calcTotales(lineas, porcentajes) {
  let subtotal = 0;
  for (const l of lineas) {
    const cant = toNum(l.cantidad_facturar);
    const vu = toNum(l.valor_unitario);
    const parcial = Number((cant * vu).toFixed(2));
    l.vr_parcial = parcial;
    l.diferencia = Number(
      (toNum(l.cantidad_enviada) - toNum(l.cantidad_ya_facturada || 0) - cant).toFixed(4)
    );
    subtotal += parcial;
  }
  const adm = subtotal * (toNum(porcentajes.porc_adm) / 100);
  const imp = subtotal * (toNum(porcentajes.porc_imp) / 100);
  const ut = subtotal * (toNum(porcentajes.porc_ut) / 100);
  const iva = ut * (toNum(porcentajes.porc_iva) / 100);
  const base = subtotal + adm + imp + ut + iva;
  const amort = base * (toNum(porcentajes.porc_amort_anticipo) / 100);
  const rete = base * (toNum(porcentajes.porc_rete_garantia) / 100);
  const valor_neto = Number((base - amort - rete).toFixed(2));
  return {
    subtotal: Number(subtotal.toFixed(2)),
    valor_neto,
    desglose: { adm, imp, ut, iva, amort, rete },
  };
}

/**
 * POST body: { estado: BORRADOR|GUARDADA, cabecera, porcentajes, lineas[] }
 */
const guardar = async (req, res) => {
  if (!requireEditor(req, res)) return;
  try {
    const body = req.body || {};
    const estadoIn = String(body.estado || 'GUARDADA').toUpperCase();
    if (!['BORRADOR', 'GUARDADA'].includes(estadoIn)) {
      return res.status(400).json({ mensaje: 'Estado inválido para guardar.' });
    }

    const cab = body.cabecera || {};
    const numero_contrato = String(cab.numero_contrato || '').trim();
    const numerodoc_contrato = String(cab.numerodoc_contrato || cab.numerodoc || '').trim();
    if (!numero_contrato || !numerodoc_contrato) {
      return res.status(400).json({ mensaje: 'Faltan datos del contrato.' });
    }

    const lineasIn = Array.isArray(body.lineas) ? body.lineas : [];
    const lineas = lineasIn
      .map((l) => ({ ...l }))
      .filter((l) => toNum(l.cantidad_facturar) > 0);

    if (estadoIn !== 'BORRADOR' && lineas.length === 0) {
      return res.status(400).json({ mensaje: 'Incluya al menos una cantidad a facturar.' });
    }

    const idExistente = Number(body.id) || null;
    const idUsuario = Number(req.user?.id_usuario) || null;

    // Validar pendientes (no sobrefacturar remisión); al editar, excluir esta memoria
    const facturado = await getFacturadoContrato(db, numero_contrato, {
      excludeMemoriaId: idExistente,
    });
    for (const l of lineas) {
      const rid = Number(l.remision_plano_id);
      const enviada = toNum(l.cantidad_enviada);
      const ya = facturado.cantidad_por_remision_plano[rid] || 0;
      const max = Math.max(0, enviada - ya);
      if (toNum(l.cantidad_facturar) > max + 0.0001) {
        return res.status(400).json({
          mensaje: `La cantidad a facturar del ítem ${l.item || rid} supera el pendiente (${max}).`,
        });
      }
      l.cantidad_ya_facturada = ya;
    }

    const porcentajes = body.porcentajes || {};
    const totales = calcTotales(lineas, porcentajes);

    let idMemoria = idExistente;
    if (idExistente) {
      const cur = await queryAsync(
        `SELECT id, estado FROM memoria_facturacion WHERE id = ? LIMIT 1`,
        [idExistente]
      );
      const row = cur?.[0];
      if (!row) return res.status(404).json({ mensaje: 'Memoria no encontrada.' });
      if (!['BORRADOR', 'GUARDADA'].includes(String(row.estado))) {
        return res.status(400).json({
          mensaje: 'Solo se pueden editar memorias en borrador o guardadas.',
        });
      }
      const evidenciasJson = serializeEvidencias(body.evidencias);
      await queryAsync(
        `UPDATE memoria_facturacion SET
            numero_contrato = ?, numerodoc_contrato = ?,
            constructora = ?, proyecto = ?, tipo_documento = ?,
            empresa_asociada = ?, fecha_acta = ?, fecha_ultimo_corte = ?,
            observaciones = ?, evidencias_json = ?, estado = ?,
            porc_adm = ?, porc_imp = ?, porc_ut = ?, porc_iva = ?,
            porc_amort_anticipo = ?, porc_rete_garantia = ?,
            subtotal = ?, valor_neto = ?, id_usuario = ?
          WHERE id = ?`,
        [
          numero_contrato,
          numerodoc_contrato,
          cab.constructora || null,
          cab.proyecto || null,
          cab.tipo_documento || null,
          cab.empresa_asociada || null,
          cab.fecha_acta || null,
          cab.fecha_ultimo_corte || null,
          cab.observaciones || null,
          evidenciasJson,
          estadoIn,
          toNum(porcentajes.porc_adm),
          toNum(porcentajes.porc_imp),
          toNum(porcentajes.porc_ut),
          toNum(porcentajes.porc_iva),
          toNum(porcentajes.porc_amort_anticipo),
          toNum(porcentajes.porc_rete_garantia),
          totales.subtotal,
          totales.valor_neto,
          idUsuario,
          idExistente,
        ]
      );
      await queryAsync(`DELETE FROM memoria_facturacion_detalle WHERE id_memoria = ?`, [
        idExistente,
      ]);
    } else {
      const consecutivo = await nextConsecutivo();
      const evidenciasJson = serializeEvidencias(body.evidencias);
      const ins = await queryAsync(
        `INSERT INTO memoria_facturacion (
            consecutivo, numerodoc_contrato, numero_contrato, constructora, proyecto,
            tipo_documento, empresa_asociada, fecha_acta, fecha_ultimo_corte, observaciones,
            evidencias_json, estado, porc_adm, porc_imp, porc_ut, porc_iva,
            porc_amort_anticipo, porc_rete_garantia, subtotal, valor_neto, id_usuario
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          consecutivo,
          numerodoc_contrato,
          numero_contrato,
          cab.constructora || null,
          cab.proyecto || null,
          cab.tipo_documento || null,
          cab.empresa_asociada || null,
          cab.fecha_acta || null,
          cab.fecha_ultimo_corte || null,
          cab.observaciones || null,
          evidenciasJson,
          estadoIn,
          toNum(porcentajes.porc_adm),
          toNum(porcentajes.porc_imp),
          toNum(porcentajes.porc_ut),
          toNum(porcentajes.porc_iva),
          toNum(porcentajes.porc_amort_anticipo),
          toNum(porcentajes.porc_rete_garantia),
          totales.subtotal,
          totales.valor_neto,
          idUsuario,
        ]
      );
      idMemoria = ins.insertId;
    }

    for (const l of lineas) {
      await queryAsync(
        `INSERT INTO memoria_facturacion_detalle (
            id_memoria, remision_plano_id, remision_numerodoc, remision_material,
            item, detalle, um, cantidad_enviada, cantidad_facturar, diferencia,
            locacion, observaciones, valor_unitario, vr_parcial
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          idMemoria,
          l.remision_plano_id || null,
          l.remision_numerodoc || null,
          l.remision_material || null,
          l.item || null,
          l.detalle || null,
          l.um || null,
          toNum(l.cantidad_enviada),
          toNum(l.cantidad_facturar),
          toNum(l.diferencia),
          l.locacion || null,
          l.observaciones || null,
          toNum(l.valor_unitario),
          toNum(l.vr_parcial),
        ]
      );
    }

    const saved = await queryAsync(
      `SELECT id, consecutivo, estado, valor_neto FROM memoria_facturacion WHERE id = ?`,
      [idMemoria]
    );
    return res.status(200).json({
      mensaje: 'Memoria guardada.',
      data: saved?.[0],
      totales,
    });
  } catch (error) {
    console.error('memorias.guardar:', error);
    return res.status(500).json({ mensaje: 'Error al guardar memoria.', error: error.message });
  }
};

const finalizar = async (req, res) => {
  if (!requireEditor(req, res)) return;
  try {
    const id = Number(req.params.id);
    const rows = await queryAsync(
      `SELECT id, estado FROM memoria_facturacion WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ mensaje: 'Memoria no encontrada.' });
    if (!['BORRADOR', 'GUARDADA'].includes(String(row.estado))) {
      return res.status(400).json({ mensaje: 'La memoria no se puede finalizar.' });
    }
    await queryAsync(
      `UPDATE memoria_facturacion SET estado = 'FINALIZADA' WHERE id = ?`,
      [id]
    );
    return res.status(200).json({ mensaje: 'Memoria finalizada.', id });
  } catch (error) {
    console.error('memorias.finalizar:', error);
    return res.status(500).json({ mensaje: 'Error al finalizar.', error: error.message });
  }
};

const anular = async (req, res) => {
  if (!requireEditor(req, res)) return;
  try {
    const id = Number(req.params.id);
    const rows = await queryAsync(
      `SELECT id, estado FROM memoria_facturacion WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ mensaje: 'Memoria no encontrada.' });
    if (String(row.estado) === 'ANULADA') {
      return res.status(400).json({ mensaje: 'La memoria ya está anulada.' });
    }
    await queryAsync(
      `UPDATE memoria_facturacion SET estado = 'ANULADA' WHERE id = ?`,
      [id]
    );
    return res.status(200).json({ mensaje: 'Memoria anulada. El pendiente vuelve a estar disponible.', id });
  } catch (error) {
    console.error('memorias.anular:', error);
    return res.status(500).json({ mensaje: 'Error al anular.', error: error.message });
  }
};

/** Elimina físicamente (detalle por CASCADE). Solo BORRADOR o ANULADA. */
const eliminar = async (req, res) => {
  if (!requireEditor(req, res)) return;
  try {
    const id = Number(req.params.id);
    const rows = await queryAsync(
      `SELECT id, estado, consecutivo FROM memoria_facturacion WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ mensaje: 'Memoria no encontrada.' });
    const est = String(row.estado || '');
    if (!['BORRADOR', 'ANULADA'].includes(est)) {
      return res.status(400).json({
        mensaje:
          'Solo se pueden eliminar memorias en borrador o anuladas. Use Anular para liberar pendientes.',
      });
    }
    await queryAsync(`DELETE FROM memoria_facturacion WHERE id = ?`, [id]);
    return res.status(200).json({
      mensaje: `Memoria ${row.consecutivo} eliminada.`,
      id,
    });
  } catch (error) {
    console.error('memorias.eliminar:', error);
    return res.status(500).json({ mensaje: 'Error al eliminar.', error: error.message });
  }
};

module.exports = {
  getContexto,
  listar,
  obtener,
  guardar,
  finalizar,
  anular,
  eliminar,
};
