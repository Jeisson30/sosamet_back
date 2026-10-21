const db = require('../../config/db');
const {
  aplicarRestriccionValores,
  puedeEditarContrato,
} = require('../../utils/permissions');

const TIPOS_OTROSI = ['FECHA', 'CANTIDAD', 'AMBOS'];
const ESTADOS_OTROSI = ['ACTIVO', 'ANULADO'];
const MAX_FILAS = 2000;

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => (err ? reject(err) : resolve(results)));
  });

const primerResultado = (results) =>
  (Array.isArray(results) ? results.find((r) => Array.isArray(r)) : null)?.[0] || null;

const textoONull = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const sqlFechaTexto = (col) => `
  CASE
    WHEN ${col} REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN STR_TO_DATE(LEFT(${col}, 10), '%Y-%m-%d')
    WHEN ${col} REGEXP '^[A-Za-z]{3} [A-Za-z]{3} [0-9]{1,2} [0-9]{4}' THEN STR_TO_DATE(SUBSTRING(${col}, 5, 11), '%b %d %Y')
    WHEN ${col} REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}' THEN STR_TO_DATE(SUBSTRING_INDEX(${col}, ' ', 1), '%d/%m/%Y')
    ELSE NULL
  END`;

/** Cabecera EAV de los contratos (una fila por contrato). */
const SQL_CONTRATOS = `
  SELECT h.*,
         DATE_FORMAT(${sqlFechaTexto('h.fecha_inicio_txt')}, '%Y-%m-%d') AS fecha_inicio,
         DATE_FORMAT(${sqlFechaTexto('h.fecha_fin_txt')}, '%Y-%m-%d') AS fecha_fin,
         NULLIF(TRIM(CONCAT(IFNULL(ue.nombre, ''), ' ', IFNULL(ue.apellido, ''))), '') AS encargado
    FROM (
      SELECT TRIM(numerodoc) AS numerodoc,
             MAX(CASE WHEN nombre_campo_doc = 'numero_contrato'      THEN TRIM(valor_campo_doc) END) AS numero_contrato,
             MAX(CASE WHEN nombre_campo_doc = 'empresa'              THEN TRIM(valor_campo_doc) END) AS constructora,
             MAX(CASE WHEN nombre_campo_doc = 'proyecto'             THEN TRIM(valor_campo_doc) END) AS proyecto,
             MAX(CASE WHEN nombre_campo_doc = 'tipo_contrato'        THEN TRIM(valor_campo_doc) END) AS tipo_contrato,
             MAX(CASE WHEN nombre_campo_doc = 'tipo_doc_catalogo'    THEN TRIM(valor_campo_doc) END) AS tipo_doc_catalogo,
             MAX(CASE WHEN nombre_campo_doc = 'empresa_asociada'     THEN TRIM(valor_campo_doc) END) AS empresa_asociada_id,
             MAX(CASE WHEN nombre_campo_doc = 'encargado_contrato'   THEN TRIM(valor_campo_doc) END) AS id_encargado,
             MAX(CASE WHEN nombre_campo_doc = 'estado'               THEN TRIM(valor_campo_doc) END) AS estado_txt,
             MAX(CASE WHEN nombre_campo_doc = 'valor_contrato'       THEN TRIM(valor_campo_doc) END) AS valor_contrato,
             MAX(CASE WHEN nombre_campo_doc = 'fecha_inicio'         THEN TRIM(valor_campo_doc) END) AS fecha_inicio_txt,
             MAX(CASE WHEN nombre_campo_doc = 'fecha_fin'            THEN TRIM(valor_campo_doc) END) AS fecha_fin_txt
        FROM item_documentos
       WHERE UPPER(TRIM(tipo_doc)) = 'CONTRATO'
       GROUP BY TRIM(numerodoc)
    ) h
    LEFT JOIN usuarios ue
      ON h.id_encargado REGEXP '^[0-9]+$'
     AND ue.id_usuario = CAST(h.id_encargado AS UNSIGNED)`;

const cargarEmpresas = async () => {
  const map = new Map();
  try {
    const results = await query('CALL sp_consultar_empresas()');
    for (const e of (results && results[0]) || []) {
      if (e?.id != null) map.set(String(e.id), String(e.nombre_empresa ?? '').trim());
    }
  } catch {
    /* sin catálogo se muestra el id */
  }
  return map;
};

const mapContrato = (row, empresas) => ({
  numerodoc: row.numerodoc,
  numero_contrato: row.numero_contrato || row.numerodoc,
  constructora: row.constructora,
  proyecto: row.proyecto,
  tipo_contrato: row.tipo_contrato,
  tipo_doc_catalogo: row.tipo_doc_catalogo,
  empresa_asociada: row.empresa_asociada_id
    ? empresas.get(String(row.empresa_asociada_id)) || row.empresa_asociada_id
    : null,
  encargado: row.encargado,
  estado: row.estado_txt || 'Activo',
  valor_contrato: row.valor_contrato,
  fecha_inicio: row.fecha_inicio,
  fecha_fin: row.fecha_fin,
  fecha_fin_txt: row.fecha_fin_txt,
});

const responderError = (res, err, contexto) => {
  console.error(`Error ${contexto}:`, err);
  return res.status(500).json({ codigo: -1, mensaje: `No se pudo ${contexto}.`, error: err.message });
};

const requireAdmin = (req, res) => {
  if (!req.user || Number(req.user.id_perfil) !== 1) {
    res.status(403).json({
      codigo: 0,
      mensaje: 'Solo administradores pueden anular o eliminar Otros Sí.',
    });
    return false;
  }
  return true;
};

const requireEditorOtroSi = (req, res) => {
  if (!puedeEditarContrato(req.user)) {
    res.status(403).json({
      codigo: 0,
      mensaje: 'No tiene permiso para registrar o editar Otros Sí.',
    });
    return false;
  }
  return true;
};

const idOtroSi = (v) => {
  const id = Number(v);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const statusSp = (codigo, ok = 200) =>
  codigo === 1 ? ok : codigo === 2 ? 409 : codigo === 0 ? 400 : 500;

const normCodigo = (v) => String(v ?? '').trim().toUpperCase();
const redondear2 = (n) => Math.round(n * 100) / 100;

/** Último Otro Sí activo del contrato (solo ese se puede editar / anular / eliminar). */
const SQL_ES_ULTIMO = (alias) => `
  (${alias}.estado = 'ACTIVO' AND NOT EXISTS (
     SELECT 1 FROM contrato_otrosi o2
      WHERE o2.numerodoc = ${alias}.numerodoc AND o2.estado = 'ACTIVO' AND o2.consecutivo > ${alias}.consecutivo
  ))`;

/**
 * Contrato tal como estaba antes del Otro Sí (para editarlo): misma lógica que SP_CONTRATO_OTROSI_REVERTIR.
 * El ítem se ubica por id o, si el contrato se reeditó (ids nuevos), por código de item único.
 */
const revertirEnMemoria = (items, detalle) => {
  const lista = items.map((i) => ({ ...i }));
  const ubicar = (d) => {
    let idx = lista.findIndex(
      (i) =>
        i.tabla_origen === d.tabla_origen &&
        i.id_item_origen === d.id_item_origen &&
        (!d.item || normCodigo(i.item) === normCodigo(d.item))
    );
    if (idx < 0 && d.item) {
      const mismos = lista
        .map((i, k) => (i.tabla_origen === d.tabla_origen && normCodigo(i.item) === normCodigo(d.item) ? k : -1))
        .filter((k) => k >= 0);
      if (mismos.length === 1) idx = mismos[0];
    }
    return idx;
  };

  const prefill = [];
  const quitar = new Set();
  for (const d of detalle) {
    const idx = ubicar(d);
    if (idx < 0) {
      return { error: `No se encontró en el contrato el ítem ${d.item || d.id_item_origen} del Otro Sí; el contrato se modificó después.` };
    }
    const it = lista[idx];
    const adicional = Number(d.cantidad_adicional) || 0;
    if (Number(d.es_nuevo) === 1) {
      quitar.add(idx);
      prefill.push({
        tabla_origen: d.tabla_origen,
        es_nuevo: 1,
        item: d.item,
        insumo: d.insumo,
        ref: it.ref,
        detalle: d.detalle,
        um: d.um,
        cantidad_adicional: adicional,
        valor_unitario: d.valor_unitario != null ? Number(d.valor_unitario) : null,
        observaciones: d.observaciones,
      });
      continue;
    }
    const cant = Number(it.cantidad) || 0;
    const nueva = cant - adicional;
    if (nueva < 0) {
      return { error: `La cantidad actual del ítem ${d.item} (${cant}) es menor a la que adicionó el Otro Sí (${adicional}).` };
    }
    if (nueva > 0 && cant > 0) {
      if (it.valor_base != null) it.valor_base = redondear2((Number(it.valor_base) * nueva) / cant);
      if (it.vr_total != null) it.vr_total = redondear2((Number(it.vr_total) * nueva) / cant);
    }
    it.cantidad = nueva;
    prefill.push({
      tabla_origen: d.tabla_origen,
      id_item_origen: it.id_item_origen,
      es_nuevo: 0,
      cantidad_adicional: adicional,
      observaciones: d.observaciones,
    });
  }
  return { items: lista.filter((_, k) => !quitar.has(k)), prefill };
};

/**
 * Contratos activos para el buscador del Otro Sí.
 * Filtros: constructora, proyecto (nombre), tipo_doc (tipo_doc_catalogo), numerodoc.
 */
const listarContratosActivos = async (req, res) => {
  const q = req.query || {};
  const where = [`UPPER(IFNULL(NULLIF(c.estado_txt, ''), 'ACTIVO')) = 'ACTIVO'`];
  const params = [];

  const constructora = textoONull(q.constructora);
  if (constructora) {
    where.push('UPPER(c.constructora) = UPPER(?)');
    params.push(constructora);
  }
  const proyecto = textoONull(q.proyecto);
  if (proyecto) {
    where.push('UPPER(c.proyecto) = UPPER(?)');
    params.push(proyecto);
  }
  const tipoDoc = textoONull(q.tipo_doc);
  if (tipoDoc) {
    where.push('UPPER(c.tipo_doc_catalogo) = UPPER(?)');
    params.push(tipoDoc);
  }
  const numerodoc = textoONull(q.numerodoc);
  if (numerodoc) {
    where.push('c.numerodoc = ?');
    params.push(numerodoc);
  }

  try {
    const [rows, empresas] = await Promise.all([
      query(
        `SELECT * FROM (${SQL_CONTRATOS}) c WHERE ${where.join(' AND ')} ORDER BY c.numerodoc LIMIT ${MAX_FILAS}`,
        params
      ),
      cargarEmpresas(),
    ]);
    return res.json(
      aplicarRestriccionValores(req.user, {
        codigo: 1,
        contratos: rows.map((r) => mapContrato(r, empresas)),
      })
    );
  } catch (err) {
    return responderError(res, err, 'consultar los contratos');
  }
};

/**
 * Cabecera + ítems AIU / IVA del contrato + porcentajes para ítems nuevos + Otros Sí previos.
 * ?otrosi=<id>: edición; devuelve el contrato como estaba antes de ese Otro Sí y sus datos para precargar.
 */
const contextoContrato = async (req, res) => {
  const numerodoc = textoONull(req.params.numerodoc);
  if (!numerodoc) return res.status(400).json({ codigo: 0, mensaje: 'Contrato requerido.' });
  const idEditar = req.query?.otrosi != null ? idOtroSi(req.query.otrosi) : null;
  if (req.query?.otrosi != null && !idEditar) return res.status(400).json({ codigo: 0, mensaje: 'Otro Sí inválido.' });

  try {
    const [cab, empresas] = await Promise.all([
      query(`SELECT * FROM (${SQL_CONTRATOS}) c WHERE c.numerodoc = ? LIMIT 1`, [numerodoc]),
      cargarEmpresas(),
    ]);
    if (!cab.length) return res.status(404).json({ codigo: 0, mensaje: 'El contrato no existe.' });

    let editar = null;
    if (idEditar) {
      const [os] = await query(
        `SELECT o.*, DATE_FORMAT(o.fecha_documento, '%Y-%m-%d') AS fecha_documento,
                DATE_FORMAT(o.fecha_fin_anterior, '%Y-%m-%d') AS fecha_fin_anterior,
                DATE_FORMAT(o.fecha_fin_nueva, '%Y-%m-%d') AS fecha_fin_nueva,
                ${SQL_ES_ULTIMO('o')} AS es_ultimo
           FROM contrato_otrosi o WHERE o.id_otrosi = ?`,
        [idEditar]
      );
      if (!os || String(os.numerodoc).trim() !== String(cab[0].numerodoc).trim()) {
        return res.status(404).json({ codigo: 0, mensaje: 'El Otro Sí no existe en este contrato.' });
      }
      if (os.estado !== 'ACTIVO') return res.status(409).json({ codigo: 0, mensaje: 'Solo se pueden editar Otros Sí activos.' });
      if (!Number(os.es_ultimo)) {
        return res.status(409).json({ codigo: 0, mensaje: 'Solo se puede editar el último Otro Sí activo del contrato.' });
      }
      editar = {
        os,
        detalle: await query('SELECT * FROM contrato_otrosi_detalle WHERE id_otrosi = ? ORDER BY id_detalle', [idEditar]),
      };
    }

    let items = await query(
      `SELECT 'AIU' AS tabla_origen, a.id AS id_item_origen, a.item, a.insumo, a.ref, a.descripcion AS detalle,
              a.cant AS cantidad, a.und AS um, a.valor_base, a.vr_total,
              a.porc_adm, a.porc_imp, a.porc_ut, a.porc_iva
         FROM aiu a WHERE TRIM(a.numdoc) = ?
       UNION ALL
       SELECT 'IVA', i.id, i.item, i.insumo, i.ref, i.descripcion, i.cant, i.und, i.valor_base, i.vr_total,
              NULL, NULL, NULL, i.porc_iva
         FROM iva_pleno i WHERE TRIM(i.numdoc) = ?
       ORDER BY tabla_origen, id_item_origen`,
      [numerodoc, numerodoc]
    );

    const contrato = mapContrato(cab[0], empresas);
    let editando = null;
    if (editar) {
      const { os, detalle } = editar;
      const rev = revertirEnMemoria(
        items.map((i) => ({ ...i, cantidad: Number(i.cantidad) || 0 })),
        detalle
      );
      if (rev.error) return res.status(409).json({ codigo: 0, mensaje: rev.error });
      items = rev.items;

      if (os.tipo !== 'CANTIDAD') {
        contrato.fecha_fin = os.fecha_fin_anterior;
        contrato.fecha_fin_txt = os.fecha_fin_anterior_txt;
      }
      const valorActual = String(contrato.valor_contrato ?? '').trim();
      if (/^\d+(\.\d+)?$/.test(valorActual) && Number(os.valor_adicional)) {
        contrato.valor_contrato = String(redondear2(Number(valorActual) - Number(os.valor_adicional)));
      }
      editando = {
        id_otrosi: os.id_otrosi,
        consecutivo: os.consecutivo,
        no_documento: os.no_documento,
        fecha_documento: os.fecha_documento,
        tipo: os.tipo,
        fecha_fin_nueva: os.fecha_fin_nueva,
        observaciones: os.observaciones,
        items: rev.prefill,
      };
    }

    const ultimo = (tabla) => [...items].reverse().find((i) => i.tabla_origen === tabla) || null;
    const refAiu = ultimo('AIU');
    const refIva = ultimo('IVA');

    const [prev] = await query(
      `SELECT COUNT(*) AS total, MAX(consecutivo) AS ultimo FROM contrato_otrosi
        WHERE numerodoc = ? AND estado = 'ACTIVO' AND (? IS NULL OR id_otrosi <> ?)`,
      [numerodoc, idEditar, idEditar]
    );

    const limpiar = (v) => (v === 'null' ? null : v);
    return res.json(
      aplicarRestriccionValores(req.user, {
        codigo: 1,
        contrato,
        editando,
        items: items.map((i) => ({
          tabla_origen: i.tabla_origen,
          id_item_origen: i.id_item_origen,
          item: limpiar(i.item),
          insumo: limpiar(i.insumo),
          ref: limpiar(i.ref),
          detalle: limpiar(i.detalle),
          cantidad: Number(i.cantidad) || 0,
          um: limpiar(i.um),
          valor_unitario:
            Number(i.cantidad) > 0 && i.valor_base != null
              ? Math.round((Number(i.valor_base) / Number(i.cantidad)) * 100) / 100
              : null,
          vr_total: i.vr_total != null ? Number(i.vr_total) : null,
        })),
        porcentajes: {
          AIU: refAiu
            ? {
                porc_adm: Number(refAiu.porc_adm) || 0,
                porc_imp: Number(refAiu.porc_imp) || 0,
                porc_ut: Number(refAiu.porc_ut) || 0,
                porc_iva: Number(refAiu.porc_iva) || 0,
              }
            : null,
          IVA: refIva ? { porc_iva: Number(refIva.porc_iva) || 0 } : null,
        },
        otrosi_previos: { total: Number(prev?.total) || 0, ultimo: prev?.ultimo ?? null },
      })
    );
  } catch (err) {
    return responderError(res, err, 'consultar el contrato');
  }
};

const numeroPositivo = (v) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/** Valida y normaliza el payload antes de llamar al SP (el SP vuelve a validar contra la BD). */
const normalizarOtroSi = (body) => {
  const cab = body?.cabecera || {};
  const tipo = textoONull(cab.tipo)?.toUpperCase();
  const noDocumento = textoONull(cab.no_documento);
  const fechaDocumento = textoONull(cab.fecha_documento);
  const fechaFinNueva = textoONull(cab.fecha_fin_nueva);
  const observaciones = textoONull(cab.observaciones);

  if (!textoONull(body?.numerodoc)) return { error: 'Seleccione el contrato.' };
  if (!noDocumento) return { error: 'Digite el No. Documento del Otro Sí.' };
  if (noDocumento.length > 50) return { error: 'El No. Documento admite máximo 50 caracteres.' };
  if (!fechaDocumento || !esFecha(fechaDocumento)) return { error: 'Seleccione una fecha de documento válida.' };
  if (!TIPOS_OTROSI.includes(tipo)) return { error: 'Seleccione el tipo de Otro Sí.' };
  if (observaciones && observaciones.length > 1000) {
    return { error: 'Las observaciones generales admiten máximo 1000 caracteres.' };
  }

  const aplicaFecha = tipo !== 'CANTIDAD';
  const aplicaCant = tipo !== 'FECHA';

  if (aplicaFecha && (!fechaFinNueva || !esFecha(fechaFinNueva))) {
    return { error: 'Seleccione la nueva fecha de finalización.' };
  }

  const items = [];
  if (aplicaCant) {
    const lista = Array.isArray(body?.items) ? body.items : [];
    if (!lista.length) return { error: 'Agregue al menos un ítem con cantidad adicional.' };

    for (const [idx, it] of lista.entries()) {
      const fila = idx + 1;
      const tabla = textoONull(it?.tabla_origen)?.toUpperCase();
      if (!['AIU', 'IVA'].includes(tabla)) return { error: `Fila ${fila}: indique si el ítem es AIU o IVA.` };
      const cantidad = numeroPositivo(it?.cantidad_adicional);
      if (cantidad === null) return { error: `Fila ${fila}: la cantidad adicional debe ser mayor a 0.` };
      const obs = textoONull(it?.observaciones);
      if (obs && obs.length > 500) return { error: `Fila ${fila}: la observación admite máximo 500 caracteres.` };

      const idOrigen = Number(it?.id_item_origen);
      if (Number.isInteger(idOrigen) && idOrigen > 0) {
        items.push({ tabla_origen: tabla, id_item_origen: idOrigen, cantidad_adicional: cantidad, observaciones: obs });
        continue;
      }

      const item = textoONull(it?.item);
      const detalle = textoONull(it?.detalle);
      const um = textoONull(it?.um);
      const valorUnitario = Number(it?.valor_unitario);
      if (!item || !detalle || !um) return { error: `Fila ${fila}: el ítem nuevo requiere item, detalle y UM.` };
      if (item.length > 50) return { error: `Fila ${fila}: el código de item admite máximo 50 caracteres.` };
      if (um.length > 10) return { error: `Fila ${fila}: la UM admite máximo 10 caracteres.` };
      if (detalle.length > 1000) return { error: `Fila ${fila}: el detalle admite máximo 1000 caracteres.` };
      if (it?.valor_unitario === '' || it?.valor_unitario == null || !Number.isFinite(valorUnitario) || valorUnitario < 0) {
        return { error: `Fila ${fila}: digite el valor unitario del ítem nuevo.` };
      }
      items.push({
        tabla_origen: tabla,
        cantidad_adicional: cantidad,
        item,
        insumo: textoONull(it?.insumo),
        ref: textoONull(it?.ref),
        detalle,
        um,
        valor_unitario: valorUnitario,
        observaciones: obs,
      });
    }
  }

  return {
    numerodoc: textoONull(body.numerodoc),
    cabecera: {
      no_documento: noDocumento,
      fecha_documento: fechaDocumento,
      tipo,
      fecha_fin_nueva: aplicaFecha ? fechaFinNueva : null,
      observaciones,
    },
    items,
  };
};

/** Registro (idEditar null) o edición; el SP reversa y vuelve a aplicar en una sola transacción. */
const guardarOtroSi = async (req, res, idEditar) => {
  const datos = normalizarOtroSi(req.body);
  if (datos.error) return res.status(400).json({ codigo: 0, mensaje: datos.error });

  try {
    const results = await query('CALL SP_CONTRATO_REGISTRAR_OTROSI(?, ?, ?, ?, ?)', [
      idEditar,
      datos.numerodoc,
      req.user?.id_usuario ?? null,
      JSON.stringify(datos.cabecera),
      JSON.stringify(datos.items),
    ]);
    const r = primerResultado(results) || {};
    return res.status(statusSp(Number(r.codigo), idEditar ? 200 : 201)).json(r);
  } catch (err) {
    return responderError(res, err, idEditar ? 'editar el Otro Sí' : 'registrar el Otro Sí');
  }
};

const registrarOtroSi = (req, res) => {
  if (!requireEditorOtroSi(req, res)) return;
  return guardarOtroSi(req, res, null);
};

const editarOtroSi = (req, res) => {
  if (!requireEditorOtroSi(req, res)) return;
  const id = idOtroSi(req.params.id);
  if (!id) return res.status(400).json({ codigo: 0, mensaje: 'Otro Sí inválido.' });
  return guardarOtroSi(req, res, id);
};

const anularOtroSi = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = idOtroSi(req.params.id);
  if (!id) return res.status(400).json({ codigo: 0, mensaje: 'Otro Sí inválido.' });
  const motivo = textoONull(req.body?.motivo);
  if (!motivo) return res.status(400).json({ codigo: 0, mensaje: 'Digite el motivo de la anulación.' });
  if (motivo.length > 500) return res.status(400).json({ codigo: 0, mensaje: 'El motivo admite máximo 500 caracteres.' });

  try {
    const results = await query('CALL SP_CONTRATO_ANULAR_OTROSI(?, ?, ?)', [id, req.user?.id_usuario ?? null, motivo]);
    const r = primerResultado(results) || {};
    return res.status(statusSp(Number(r.codigo))).json(r);
  } catch (err) {
    return responderError(res, err, 'anular el Otro Sí');
  }
};

const eliminarOtroSi = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = idOtroSi(req.params.id);
  if (!id) return res.status(400).json({ codigo: 0, mensaje: 'Otro Sí inválido.' });

  try {
    const results = await query('CALL SP_CONTRATO_ELIMINAR_OTROSI(?)', [id]);
    const r = primerResultado(results) || {};
    return res.status(statusSp(Number(r.codigo))).json(r);
  } catch (err) {
    return responderError(res, err, 'eliminar el Otro Sí');
  }
};

/**
 * Consulta de Otros Sí (uno por fila, más reciente primero).
 * Filtros: buscar (contrato / No. Documento), constructora, proyecto, tipo, fecha_desde, fecha_hasta (fecha documento).
 */
const listarOtrosSi = async (req, res) => {
  const q = req.query || {};
  const where = [];
  const params = [];

  for (const [param, op] of [['fecha_desde', '>='], ['fecha_hasta', '<=']]) {
    const f = textoONull(q[param]);
    if (!f) continue;
    if (!esFecha(f)) return res.status(400).json({ codigo: 0, mensaje: `${param} debe ser AAAA-MM-DD.` });
    where.push(`o.fecha_documento ${op} ?`);
    params.push(f);
  }
  if (q.fecha_desde && q.fecha_hasta && String(q.fecha_desde) > String(q.fecha_hasta)) {
    return res.status(400).json({ codigo: 0, mensaje: 'La fecha "Desde" no puede ser mayor que "Hasta".' });
  }

  const tipo = textoONull(q.tipo)?.toUpperCase();
  if (tipo) {
    if (!TIPOS_OTROSI.includes(tipo)) {
      return res.status(400).json({ codigo: 0, mensaje: `Tipo inválido. Use: ${TIPOS_OTROSI.join(', ')}.` });
    }
    where.push('o.tipo = ?');
    params.push(tipo);
  }
  const estado = textoONull(q.estado)?.toUpperCase();
  if (estado) {
    if (!ESTADOS_OTROSI.includes(estado)) {
      return res.status(400).json({ codigo: 0, mensaje: `Estado inválido. Use: ${ESTADOS_OTROSI.join(', ')}.` });
    }
    where.push('o.estado = ?');
    params.push(estado);
  }
  const constructora = textoONull(q.constructora);
  if (constructora) {
    where.push('UPPER(c.constructora) = UPPER(?)');
    params.push(constructora);
  }
  const proyecto = textoONull(q.proyecto);
  if (proyecto) {
    where.push('UPPER(c.proyecto) = UPPER(?)');
    params.push(proyecto);
  }
  const buscar = textoONull(q.buscar);
  if (buscar) {
    where.push('(o.numerodoc LIKE ? OR o.no_documento LIKE ? OR c.numero_contrato LIKE ?)');
    const like = `%${buscar}%`;
    params.push(like, like, like);
  }

  try {
    const rows = await query(
      `SELECT o.id_otrosi, o.numerodoc, o.consecutivo, o.no_documento, o.tipo, o.estado,
              DATE_FORMAT(o.fecha_documento, '%Y-%m-%d') AS fecha_documento,
              DATE_FORMAT(o.fecha_fin_anterior, '%Y-%m-%d') AS fecha_fin_anterior,
              DATE_FORMAT(o.fecha_fin_nueva, '%Y-%m-%d') AS fecha_fin_nueva,
              o.dias_ampliacion, o.valor_adicional, o.usuario_creacion,
              DATE_FORMAT(o.fecha_creacion, '%Y-%m-%d %H:%i') AS fecha_creacion,
              o.motivo_anulacion,
              c.numero_contrato, c.constructora, c.proyecto,
              IFNULL(NULLIF(c.estado_txt, ''), 'Activo') AS estado_contrato,
              ${SQL_ES_ULTIMO('o')} AS es_ultimo,
              (SELECT COUNT(*) FROM contrato_otrosi_detalle d WHERE d.id_otrosi = o.id_otrosi) AS total_items
         FROM contrato_otrosi o
         LEFT JOIN (${SQL_CONTRATOS}) c ON c.numerodoc = o.numerodoc
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY o.fecha_documento DESC, o.id_otrosi DESC
        LIMIT ${MAX_FILAS}`,
      params
    );
    return res.json(
      aplicarRestriccionValores(req.user, {
        codigo: 1,
        otrosi: rows.map((r) => ({
          ...r,
          valor_adicional: Number(r.valor_adicional) || 0,
          es_ultimo: !!Number(r.es_ultimo),
        })),
      })
    );
  } catch (err) {
    return responderError(res, err, 'consultar los Otros Sí');
  }
};

const detalleOtroSi = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ codigo: 0, mensaje: 'Otro Sí inválido.' });

  try {
    const [cab] = await query(
      `SELECT o.*, DATE_FORMAT(o.fecha_documento, '%Y-%m-%d') AS fecha_documento,
              DATE_FORMAT(o.fecha_fin_anterior, '%Y-%m-%d') AS fecha_fin_anterior,
              DATE_FORMAT(o.fecha_fin_nueva, '%Y-%m-%d') AS fecha_fin_nueva,
              DATE_FORMAT(o.fecha_creacion, '%Y-%m-%d %H:%i') AS fecha_creacion,
              DATE_FORMAT(o.fecha_modificacion, '%Y-%m-%d %H:%i') AS fecha_modificacion,
              DATE_FORMAT(o.fecha_anulacion, '%Y-%m-%d %H:%i') AS fecha_anulacion,
              ${SQL_ES_ULTIMO('o')} AS es_ultimo
         FROM contrato_otrosi o WHERE o.id_otrosi = ?`,
      [id]
    );
    if (!cab) return res.status(404).json({ codigo: 0, mensaje: 'El Otro Sí no existe.' });

    const [contrato, empresas, detalle] = await Promise.all([
      query(`SELECT * FROM (${SQL_CONTRATOS}) c WHERE c.numerodoc = ? LIMIT 1`, [cab.numerodoc]),
      cargarEmpresas(),
      query('SELECT * FROM contrato_otrosi_detalle WHERE id_otrosi = ? ORDER BY id_detalle', [id]),
    ]);

    // Ítems del Otro Sí que ya tienen actas de medida (advertencia al editar / anular / eliminar).
    const codigos = [...new Set(detalle.map((d) => String(d.item ?? '').trim()).filter(Boolean))];
    let itemsConActas = [];
    if (codigos.length) {
      try {
        const actas = await query(
          `SELECT DISTINCT TRIM(amd_item) AS item FROM actas_medida_detalle
            WHERE TRIM(amd_numero_contrato) = ? AND TRIM(amd_item) IN (?)`,
          [String(cab.numerodoc).trim(), codigos]
        );
        itemsConActas = actas.map((a) => a.item);
      } catch {
        /* sin tabla de actas no hay advertencia */
      }
    }

    const num = (v) => (v == null ? null : Number(v));
    return res.json(
      aplicarRestriccionValores(req.user, {
        codigo: 1,
        otrosi: {
          ...cab,
          valor_adicional: Number(cab.valor_adicional) || 0,
          es_ultimo: !!Number(cab.es_ultimo),
        },
        contrato: contrato[0] ? mapContrato(contrato[0], empresas) : null,
        items_con_actas: itemsConActas,
        detalle: detalle.map((d) => ({
          ...d,
          cantidad_anterior: num(d.cantidad_anterior),
          cantidad_adicional: num(d.cantidad_adicional),
          cantidad_nueva: num(d.cantidad_nueva),
          valor_unitario: num(d.valor_unitario),
          vr_total_anterior: num(d.vr_total_anterior),
          vr_total_nuevo: num(d.vr_total_nuevo),
        })),
      })
    );
  } catch (err) {
    return responderError(res, err, 'consultar el Otro Sí');
  }
};

module.exports = {
  listarContratosActivos,
  contextoContrato,
  registrarOtroSi,
  editarOtroSi,
  anularOtroSi,
  eliminarOtroSi,
  listarOtrosSi,
  detalleOtroSi,
};
