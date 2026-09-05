const db = require('../../config/db');

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

const normalizeTipo = (raw) =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Mapea el tipo UI a un grupo de amarre. */
const resolveGrupo = (tipoDoc) => {
  const t = normalizeTipo(tipoDoc);
  if (t.includes('ACTAS DE MEDIDA') || t === 'ACTAS DE MEDIDA') return 'actas';
  if (t.includes('REMISION')) return 'remisiones';
  if (t.includes('ORDEN DE COMPRA') || t.includes('ORDEN COMPRA')) return 'oc';
  if (t.includes('ACTAS DE PAGO') || t.includes('ACTA DE PAGO')) return 'actas_pago';
  if (t.includes('LIQUIDACION')) return 'liquidacion';
  if (t.includes('ADICIONAL')) return 'adicionales';
  if (t.includes('ORDEN DE TRABAJO') || t === 'OT') return 'ot';
  return null;
};

/** Tipos EAV posibles para un grupo (variantes de mayúsculas en BD). */
const eavTiposPorGrupo = (grupo) => {
  switch (grupo) {
    case 'actas':
      return ['ACTAS DE MEDIDA', 'Actas De Medida'];
    case 'remisiones':
      return ['REMISIONES', 'Remisiones'];
    case 'oc':
      return ['ORDEN DE COMPRA', 'Orden De Compra'];
    case 'actas_pago':
      return ['ACTAS DE PAGO'];
    default:
      return [];
  }
};

const upsertEavCampo = async (tipoDoc, numerodoc, nombre, valor) => {
  const existing = await queryAsync(
    `SELECT COUNT(*) AS n
       FROM item_documentos
      WHERE tipo_doc COLLATE utf8mb4_general_ci = ?
        AND numerodoc = ?
        AND nombre_campo_doc = ?`,
    [tipoDoc, numerodoc, nombre]
  );
  const n = Number(existing?.[0]?.n || 0);
  if (n > 1) {
    // Evitar duplicados EAV: dejar una sola fila con el valor nuevo.
    await queryAsync(
      `DELETE FROM item_documentos
        WHERE tipo_doc COLLATE utf8mb4_general_ci = ?
          AND numerodoc = ?
          AND nombre_campo_doc = ?`,
      [tipoDoc, numerodoc, nombre]
    );
    await queryAsync(
      `INSERT INTO item_documentos
         (tipo_doc, numerodoc, nombre_campo_doc, valor_campo_doc)
       VALUES (?, ?, ?, ?)`,
      [tipoDoc, numerodoc, nombre, valor]
    );
    return;
  }
  if (n === 1) {
    await queryAsync(
      `UPDATE item_documentos
          SET valor_campo_doc = ?
        WHERE tipo_doc COLLATE utf8mb4_general_ci = ?
          AND numerodoc = ?
          AND nombre_campo_doc = ?`,
      [valor, tipoDoc, numerodoc, nombre]
    );
  } else {
    // Preferir SP (valida catálogo); si no inserta (campo ausente en parametros), INSERT directo.
    await queryAsync(`CALL sp_insertar_item_documento(?, ?, ?, ?)`, [
      tipoDoc,
      numerodoc,
      nombre,
      valor,
    ]);
    const after = await queryAsync(
      `SELECT COUNT(*) AS n
         FROM item_documentos
        WHERE tipo_doc COLLATE utf8mb4_general_ci = ?
          AND numerodoc = ?
          AND nombre_campo_doc = ?`,
      [tipoDoc, numerodoc, nombre]
    );
    if (Number(after?.[0]?.n || 0) === 0) {
      await queryAsync(
        `INSERT INTO item_documentos
           (tipo_doc, numerodoc, nombre_campo_doc, valor_campo_doc)
         VALUES (?, ?, ?, ?)`,
        [tipoDoc, numerodoc, nombre, valor]
      );
    }
  }
};

/**
 * GET /api/administracion/cotizaciones-pendientes?tipo_doc=
 */
const listarCotizacionesPendientes = async (req, res) => {
  try {
    const tipoDoc = String(req.query?.tipo_doc || '').trim();
    if (!tipoDoc) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'El tipo de documento es obligatorio.',
        data: [],
      });
    }

    const grupo = resolveGrupo(tipoDoc);
    if (!grupo) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'Tipo de documento no soportado para amarre.',
        data: [],
      });
    }

    const claves = new Map(); // value -> { label, value, origen, cantidad }

    const addClave = (clave, origen, cantidad = 1) => {
      const v = String(clave || '').trim();
      if (!v) return;
      const prev = claves.get(v);
      if (prev) {
        prev.cantidad += cantidad;
        if (!prev.origen.includes(origen)) prev.origen.push(origen);
      } else {
        claves.set(v, {
          value: v,
          label: v,
          origen: [origen],
          cantidad,
        });
      }
    };

    if (['actas', 'remisiones', 'oc', 'actas_pago'].includes(grupo)) {
      const tipos = eavTiposPorGrupo(grupo);
      for (const tipo of tipos) {
        // Solo pendientes reales: tipo_vinculo = COTIZACION (no incluir legados sin discriminador).
        const rows = await queryAsync(
          `SELECT
              TRIM(C.valor_campo_doc) AS cotizacion,
              COUNT(DISTINCT C.numerodoc) AS cantidad
             FROM item_documentos C
             INNER JOIN item_documentos T
               ON T.tipo_doc = C.tipo_doc
              AND T.numerodoc = C.numerodoc
              AND T.nombre_campo_doc = 'tipo_vinculo'
              AND UPPER(TRIM(T.valor_campo_doc)) = 'COTIZACION'
            WHERE C.tipo_doc = ?
              AND C.nombre_campo_doc = 'numero_contrato'
              AND TRIM(IFNULL(C.valor_campo_doc, '')) <> ''
            GROUP BY TRIM(C.valor_campo_doc)`,
          [tipo]
        );
        (rows || []).forEach((r) =>
          addClave(r.cotizacion, `EAV:${tipo}`, Number(r.cantidad) || 1)
        );
      }
    }

    if (grupo === 'actas') {
      const rows = await queryAsync(
        `SELECT TRIM(amd_numero_contrato) AS cotizacion, COUNT(*) AS cantidad
           FROM actas_medida_detalle
          WHERE UPPER(TRIM(IFNULL(amd_tipo_vinculo, ''))) = 'COTIZACION'
            AND TRIM(IFNULL(amd_numero_contrato, '')) <> ''
          GROUP BY TRIM(amd_numero_contrato)`
      );
      (rows || []).forEach((r) =>
        addClave(r.cotizacion, 'actas_medida_detalle', Number(r.cantidad) || 1)
      );
    }

    if (grupo === 'remisiones') {
      const rows = await queryAsync(
        `SELECT TRIM(contrato) AS cotizacion, COUNT(*) AS cantidad
           FROM remisiones_plano
          WHERE UPPER(TRIM(IFNULL(tipo_vinculo, ''))) = 'COTIZACION'
            AND TRIM(IFNULL(contrato, '')) <> ''
          GROUP BY TRIM(contrato)`
      );
      (rows || []).forEach((r) =>
        addClave(r.cotizacion, 'remisiones_plano', Number(r.cantidad) || 1)
      );
    }

    if (grupo === 'oc') {
      const rows = await queryAsync(
        `SELECT TRIM(contrato) AS cotizacion, COUNT(*) AS cantidad
           FROM orden_compra
          WHERE UPPER(TRIM(IFNULL(tipo_vinculo, ''))) = 'COTIZACION'
            AND TRIM(IFNULL(contrato, '')) <> ''
          GROUP BY TRIM(contrato)`
      );
      (rows || []).forEach((r) =>
        addClave(r.cotizacion, 'orden_compra', Number(r.cantidad) || 1)
      );
    }

    if (grupo === 'liquidacion') {
      const rows = await queryAsync(
        `SELECT TRIM(no_contrato) AS cotizacion, COUNT(*) AS cantidad
           FROM liquidacion_corte_plano
          WHERE UPPER(TRIM(IFNULL(tipo_vinculo, ''))) = 'COTIZACION'
            AND TRIM(IFNULL(no_contrato, '')) <> ''
          GROUP BY TRIM(no_contrato)`
      );
      (rows || []).forEach((r) =>
        addClave(r.cotizacion, 'liquidacion_corte_plano', Number(r.cantidad) || 1)
      );
    }

    if (grupo === 'adicionales') {
      const rows = await queryAsync(
        `SELECT TRIM(contrato_no) AS cotizacion, COUNT(*) AS cantidad
           FROM ejecucion_corte_adicional
          WHERE UPPER(TRIM(IFNULL(tipo_vinculo, ''))) = 'COTIZACION'
            AND TRIM(IFNULL(contrato_no, '')) <> ''
          GROUP BY TRIM(contrato_no)`
      );
      (rows || []).forEach((r) =>
        addClave(r.cotizacion, 'ejecucion_corte_adicional', Number(r.cantidad) || 1)
      );
    }

    if (grupo === 'ot' || grupo === 'actas') {
      const rows = await queryAsync(
        `SELECT TRIM(ot_contrato) AS cotizacion, COUNT(*) AS cantidad
           FROM order_work
          WHERE UPPER(TRIM(IFNULL(ot_tipo_vinculo, ''))) = 'COTIZACION'
            AND TRIM(IFNULL(ot_contrato, '')) <> ''
          GROUP BY TRIM(ot_contrato)`
      );
      (rows || []).forEach((r) =>
        addClave(r.cotizacion, 'order_work', Number(r.cantidad) || 1)
      );
    }

    const data = Array.from(claves.values())
      .map((c) => ({
        ...c,
        label: `${c.value} (${c.cantidad})`,
      }))
      .sort((a, b) => a.value.localeCompare(b.value, 'es'));

    return res.status(200).json({
      Codigo: 1,
      Mensaje: 'OK',
      data,
    });
  } catch (error) {
    console.error('listarCotizacionesPendientes:', error);
    return res.status(500).json({
      Codigo: 0,
      Mensaje: 'Error al consultar cotizaciones pendientes.',
      error: error.message,
      data: [],
    });
  }
};

const amarrarEavPorTipos = async (tipos, cotizacion, contrato) => {
  let afectados = 0;
  for (const tipo of tipos) {
    // Pendientes: tipo_vinculo=COTIZACION, o aún con la cotización en numero_contrato
    // y numero_cotizacion = esa clave (casos sin discriminador pero ya marcados).
    const docs = await queryAsync(
      `SELECT DISTINCT C.numerodoc
         FROM item_documentos C
         LEFT JOIN item_documentos T
           ON T.tipo_doc = C.tipo_doc
          AND T.numerodoc = C.numerodoc
          AND T.nombre_campo_doc = 'tipo_vinculo'
         LEFT JOIN item_documentos Q
           ON Q.tipo_doc = C.tipo_doc
          AND Q.numerodoc = C.numerodoc
          AND Q.nombre_campo_doc = 'numero_cotizacion'
        WHERE C.tipo_doc = ?
          AND C.nombre_campo_doc = 'numero_contrato'
          AND TRIM(C.valor_campo_doc) = ?
          AND (
            UPPER(TRIM(IFNULL(T.valor_campo_doc, ''))) = 'COTIZACION'
            OR (
              TRIM(IFNULL(Q.valor_campo_doc, '')) = ?
              AND UPPER(TRIM(IFNULL(T.valor_campo_doc, ''))) <> 'CONTRATO'
            )
          )`,
      [tipo, cotizacion, cotizacion]
    );

    for (const row of docs || []) {
      const numerodoc = row.numerodoc;
      await upsertEavCampo(tipo, numerodoc, 'numero_cotizacion', cotizacion);
      await upsertEavCampo(tipo, numerodoc, 'numero_contrato', contrato);
      await upsertEavCampo(tipo, numerodoc, 'tipo_vinculo', 'CONTRATO');
      afectados += 1;
    }
  }
  return afectados;
};

/**
 * POST /api/administracion/amarrar-contrato
 * Body: { numero_contrato, tipo_doc, numero_cotizacion }
 */
const amarrarContrato = async (req, res) => {
  try {
    const numero_contrato = String(req.body?.numero_contrato || '').trim();
    const tipo_doc = String(req.body?.tipo_doc || '').trim();
    const numero_cotizacion = String(req.body?.numero_cotizacion || '').trim();

    if (!numero_contrato || !tipo_doc || !numero_cotizacion) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje:
          'numero_contrato, tipo_doc y numero_cotizacion son obligatorios.',
      });
    }

    if (numero_contrato === numero_cotizacion) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'El contrato y la cotización no pueden ser el mismo valor.',
      });
    }

    const grupo = resolveGrupo(tipo_doc);
    if (!grupo) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'Tipo de documento no soportado para amarre.',
      });
    }

    const resumen = {
      eav_documentos: 0,
      actas_detalle: 0,
      remisiones_plano: 0,
      orden_compra: 0,
      liquidacion_plano: 0,
      adicionales: 0,
      order_work: 0,
    };

    if (['actas', 'remisiones', 'oc', 'actas_pago'].includes(grupo)) {
      resumen.eav_documentos = await amarrarEavPorTipos(
        eavTiposPorGrupo(grupo),
        numero_cotizacion,
        numero_contrato
      );
    }

    if (grupo === 'actas') {
      const r = await queryAsync(
        `UPDATE actas_medida_detalle
            SET amd_numero_contrato = ?,
                amd_tipo_vinculo = 'CONTRATO'
          WHERE TRIM(amd_numero_contrato) = ?
            AND UPPER(TRIM(IFNULL(amd_tipo_vinculo, ''))) = 'COTIZACION'`,
        [numero_contrato, numero_cotizacion]
      );
      resumen.actas_detalle = r?.affectedRows || 0;

      // Cascada OT hijas que heredaron la cotización
      const ow = await queryAsync(
        `UPDATE order_work
            SET ot_contrato = ?,
                ot_tipo_vinculo = 'CONTRATO'
          WHERE TRIM(ot_contrato) = ?
            AND UPPER(TRIM(IFNULL(ot_tipo_vinculo, ''))) = 'COTIZACION'`,
        [numero_contrato, numero_cotizacion]
      );
      resumen.order_work = ow?.affectedRows || 0;
    }

    if (grupo === 'remisiones') {
      const r = await queryAsync(
        `UPDATE remisiones_plano
            SET contrato = ?,
                tipo_vinculo = 'CONTRATO'
          WHERE TRIM(contrato) = ?
            AND UPPER(TRIM(IFNULL(tipo_vinculo, ''))) = 'COTIZACION'`,
        [numero_contrato, numero_cotizacion]
      );
      resumen.remisiones_plano = r?.affectedRows || 0;
    }

    if (grupo === 'oc') {
      const r = await queryAsync(
        `UPDATE orden_compra
            SET contrato = ?,
                tipo_vinculo = 'CONTRATO'
          WHERE TRIM(contrato) = ?
            AND UPPER(TRIM(IFNULL(tipo_vinculo, ''))) = 'COTIZACION'`,
        [numero_contrato, numero_cotizacion]
      );
      resumen.orden_compra = r?.affectedRows || 0;
    }

    if (grupo === 'liquidacion') {
      const r = await queryAsync(
        `UPDATE liquidacion_corte_plano
            SET no_contrato = ?,
                tipo_vinculo = 'CONTRATO'
          WHERE TRIM(no_contrato) = ?
            AND UPPER(TRIM(IFNULL(tipo_vinculo, ''))) = 'COTIZACION'`,
        [numero_contrato, numero_cotizacion]
      );
      resumen.liquidacion_plano = r?.affectedRows || 0;
    }

    if (grupo === 'adicionales') {
      const r = await queryAsync(
        `UPDATE ejecucion_corte_adicional
            SET contrato_no = ?,
                tipo_vinculo = 'CONTRATO'
          WHERE TRIM(contrato_no) = ?
            AND UPPER(TRIM(IFNULL(tipo_vinculo, ''))) = 'COTIZACION'`,
        [numero_contrato, numero_cotizacion]
      );
      resumen.adicionales = r?.affectedRows || 0;
    }

    if (grupo === 'ot') {
      const ow = await queryAsync(
        `UPDATE order_work
            SET ot_contrato = ?,
                ot_tipo_vinculo = 'CONTRATO'
          WHERE TRIM(ot_contrato) = ?
            AND UPPER(TRIM(IFNULL(ot_tipo_vinculo, ''))) = 'COTIZACION'`,
        [numero_contrato, numero_cotizacion]
      );
      resumen.order_work = ow?.affectedRows || 0;
    }

    const total =
      resumen.eav_documentos +
      resumen.actas_detalle +
      resumen.remisiones_plano +
      resumen.orden_compra +
      resumen.liquidacion_plano +
      resumen.adicionales +
      resumen.order_work;

    if (total === 0) {
      return res.status(404).json({
        Codigo: 0,
        Mensaje:
          'No se encontraron registros pendientes con esa cotización para el tipo indicado.',
        resumen,
      });
    }

    return res.status(200).json({
      Codigo: 1,
      Mensaje: `Amarre realizado: cotización ${numero_cotizacion} → contrato ${numero_contrato}.`,
      resumen,
      total,
    });
  } catch (error) {
    console.error('amarrarContrato:', error);
    return res.status(500).json({
      Codigo: 0,
      Mensaje: 'Error al amarrar cotización al contrato.',
      error: error.message,
    });
  }
};

module.exports = {
  listarCotizacionesPendientes,
  amarrarContrato,
};
