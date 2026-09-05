const { queryAsync, runInTransaction } = require('../../../utils/dbTransaction');

const toInt = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const TIPOS_ACTIVIDAD = new Set(['PINTURA', 'FABRICACIÓN', 'INSTALACIÓN']);

const filtrarFilasAdicionales = (adicionales) =>
  (Array.isArray(adicionales) ? adicionales : []).filter((a) => {
    const item = String(a?.item || '').trim();
    const desc = String(a?.descripcion || '').trim();
    const cant = a?.cantidad;
    const tipo = String(a?.tipo_actividad || '').trim();
    const empresa = toInt(a?.empresa_id);
    return (
      item ||
      desc ||
      (cant != null && cant !== '') ||
      tipo ||
      empresa
    );
  });

const mapFilaAdicional = (a, usuario_id) => {
  const checked = a.checked === true || Number(a.adc_estado) === 2;
  const tipo = String(a.tipo_actividad || '').trim().toUpperCase();
  const tipoVinculo =
    String(a.tipo_vinculo || '').trim().toUpperCase() === 'COTIZACION'
      ? 'COTIZACION'
      : 'CONTRATO';
  return {
    id_adicional: toInt(a.id_adicional),
    usuario_id,
    empresa_id: toInt(a.empresa_id),
    tipo_actividad: tipo || null,
    id_order_work: toInt(a.id_order_work),
    item: a.item != null ? String(a.item).trim() || null : null,
    contrato_no: a.contrato_no != null ? String(a.contrato_no).trim() || null : null,
    tipo_vinculo: tipoVinculo,
    proyecto: a.proyecto != null ? String(a.proyecto).trim() || null : null,
    descripcion: a.descripcion != null ? String(a.descripcion).trim() || null : null,
    cantidad:
      a.cantidad != null && a.cantidad !== '' ? Number(a.cantidad) : null,
    um: a.um != null ? String(a.um).trim() || null : null,
    ancho: a.ancho != null && a.ancho !== '' ? Number(a.ancho) : null,
    alto: a.alto != null && a.alto !== '' ? Number(a.alto) : null,
    acta_medida_no:
      a.acta_medida_no != null ? String(a.acta_medida_no).trim() || null : null,
    orden_no: a.orden_no != null ? String(a.orden_no).trim() || null : null,
    plano_no: a.plano_no != null ? String(a.plano_no).trim() || null : null,
    observaciones:
      a.observaciones != null ? String(a.observaciones).trim() || null : null,
    adc_estado: checked ? 2 : 1,
  };
};

const validarFilaAdicional = (fila) => {
  if (!fila.tipo_actividad || !TIPOS_ACTIVIDAD.has(fila.tipo_actividad)) {
    return 'Cada adicional debe tener tipo de actividad (PINTURA, FABRICACIÓN o INSTALACIÓN).';
  }
  if (!fila.empresa_id) {
    return 'Cada adicional debe tener empresa seleccionada.';
  }
  if (!fila.contrato_no) {
    return 'Cada adicional debe tener contrato o N° cotización.';
  }
  if (!fila.item && !fila.descripcion) {
    return 'Cada adicional debe tener item o descripción.';
  }
  return null;
};

/**
 * Reemplaza pendientes del usuario e inserta filas (completadas quedan).
 */
const reemplazarAdicionalesUsuario = async (usuario_id, adicionales) => {
  const filas = filtrarFilasAdicionales(adicionales).map((a) =>
    mapFilaAdicional(a, usuario_id)
  );

  for (const f of filas) {
    const err = validarFilaAdicional(f);
    if (err) {
      throw Object.assign(new Error(err), { sqlMessage: err });
    }
  }

  await runInTransaction(async (queryTx) => {
    await queryTx(
      `DELETE FROM ejecucion_corte_adicional
        WHERE usuario_id = ?
          AND IFNULL(adc_estado, 1) <> 2`,
      [usuario_id]
    );

    for (const a of filas) {
      await queryTx(
        `INSERT INTO ejecucion_corte_adicional (
          id_ejecucion, id_order_work, usuario_id, empresa_id, tipo_actividad,
          item, contrato_no, tipo_vinculo, proyecto, descripcion,
          cantidad, um, ancho, alto, acta_medida_no, orden_no, plano_no, observaciones,
          adc_estado, adc_fecha_finalizado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          null,
          a.id_order_work,
          a.usuario_id,
          a.empresa_id,
          a.tipo_actividad,
          a.item,
          a.contrato_no,
          a.tipo_vinculo || 'CONTRATO',
          a.proyecto,
          a.descripcion,
          a.cantidad,
          a.um,
          a.ancho,
          a.alto,
          a.acta_medida_no,
          a.orden_no,
          a.plano_no,
          a.observaciones,
          a.adc_estado,
          a.adc_estado === 2 ? new Date() : null,
        ]
      );
    }
  });

  return filas.length;
};

const listarAdicionalesUsuario = async (usuario_id, soloPendientes = 1) => {
  const results = await queryAsync(
    'CALL SP_CONSULTAR_ACTIVIDADES_ADICIONALES_USUARIO(?, ?)',
    [usuario_id, soloPendientes ? 1 : 0]
  );
  return Array.isArray(results?.[0]) ? results[0] : [];
};

/**
 * POST /api/gestion/ejecucion-cortes/adicionales
 * Guarda actividades adicionales del usuario (globales, no por OT).
 */
const guardarAdicionalesOt = async (req, res) => {
  try {
    const body = req.body || {};
    const adicionales = body.actividades_adicionales;
    const usuario_id = toInt(req.user?.id_usuario);

    if (!usuario_id) {
      return res.status(401).json({
        Codigo: 0,
        Mensaje: 'Usuario no autenticado.',
      });
    }

    const guardados = await reemplazarAdicionalesUsuario(
      usuario_id,
      adicionales
    );
    const items = await listarAdicionalesUsuario(usuario_id, 1);

    return res.status(200).json({
      Codigo: 1,
      Mensaje: 'Actividades adicionales guardadas.',
      usuario_id,
      guardados,
      items,
    });
  } catch (err) {
    console.error('guardarAdicionalesOt:', err);
    return res.status(400).json({
      Codigo: 0,
      Mensaje:
        err?.sqlMessage ||
        err?.message ||
        'Error al guardar actividades adicionales.',
    });
  }
};

/**
 * GET /api/gestion/ejecucion-cortes/adicionales
 * Lista adicionales del usuario autenticado (pendientes por defecto).
 */
const consultAdicionalesOt = async (req, res) => {
  try {
    const usuario_id = toInt(req.user?.id_usuario);
    if (!usuario_id) {
      return res.status(401).json({
        Codigo: 0,
        Mensaje: 'Usuario no autenticado.',
        items: [],
      });
    }

    const soloPendientes =
      req.query.solo_pendientes === '0' || req.query.solo_pendientes === 'false'
        ? 0
        : 1;

    const items = await listarAdicionalesUsuario(usuario_id, soloPendientes);
    return res.status(200).json({ items, usuario_id });
  } catch (err) {
    console.error('consultAdicionalesOt:', err);
    return res.status(500).json({
      Codigo: 0,
      Mensaje:
        err?.sqlMessage || err?.message || 'Error al consultar adicionales.',
      items: [],
    });
  }
};

/**
 * POST /api/gestion/ejecucion-cortes/finalizar
 * Cierra la OT con sus ítems. Adicionales son independientes.
 */
const finalizarEjecucionCortes = async (req, res) => {
  try {
    const body = req.body || {};
    const id_order_work = toInt(body.id_order_work);
    const empresa_asociada_id = toInt(body.empresa_asociada_id);
    const tipo_corte = String(body.tipo_corte || '').trim();
    const observaciones =
      body.observaciones != null ? String(body.observaciones) : null;
    const items = Array.isArray(body.items) ? body.items : [];

    const encargado_id =
      toInt(body.encargado_id) || toInt(req.user?.id_usuario) || null;
    const usuario_id = toInt(req.user?.id_usuario);

    if (!id_order_work) {
      return res
        .status(400)
        .json({ Codigo: 0, Mensaje: 'id_order_work es obligatorio.' });
    }
    if (!empresa_asociada_id) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'Debe seleccionar la empresa asociada.',
      });
    }
    if (!tipo_corte) {
      return res
        .status(400)
        .json({ Codigo: 0, Mensaje: 'tipo_corte es obligatorio.' });
    }
    if (!encargado_id) {
      return res
        .status(400)
        .json({ Codigo: 0, Mensaje: 'encargado_id es obligatorio.' });
    }
    if (!items.length) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'La OT no tiene ítems para finalizar.',
      });
    }

    const allChecked = items.every((it) => {
      return it.checked === true || Number(it.owd_estado) === 2;
    });
    if (!allChecked) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'Debe marcar todos los ítems (check) antes de finalizar.',
      });
    }

    const consecResults = await queryAsync('CALL SP_GENERAR_CONSECUTIVO(?)', [
      'EJECUCION_CORTE',
    ]);
    const consecRow = Array.isArray(consecResults?.[0])
      ? consecResults[0][0]
      : consecResults?.[0];
    const consecutivo = String(
      consecRow?.consecutivo || consecRow?.Consecutivo || ''
    ).trim();
    if (!consecutivo) {
      return res.status(500).json({
        Codigo: 0,
        Mensaje: 'No se pudo generar el consecutivo de ejecución.',
      });
    }

    const spResults = await queryAsync(
      'CALL SP_FINALIZAR_EJECUCION_CORTE(?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id_order_work,
        empresa_asociada_id,
        encargado_id,
        tipo_corte,
        observaciones,
        usuario_id,
        items.length,
        consecutivo,
      ]
    );

    const row = Array.isArray(spResults?.[0]) ? spResults[0][0] : spResults?.[0];
    const id_ejecucion = toInt(row?.id_ejecucion);

    if (!id_ejecucion) {
      return res.status(500).json({
        Codigo: 0,
        Mensaje: row?.Mensaje || 'No se pudo finalizar la ejecución.',
      });
    }

    return res.status(200).json({
      Codigo: 1,
      Mensaje: row?.Mensaje || 'Ejecución finalizada correctamente.',
      id_ejecucion,
      consecutivo: row?.consecutivo || consecutivo,
      id_order_work,
      estado: 2,
      adicionales_guardados: 0,
    });
  } catch (err) {
    console.error('finalizarEjecucionCortes:', err);
    const msg =
      err?.sqlMessage ||
      err?.message ||
      'Error al finalizar la ejecución de cortes.';
    return res.status(400).json({ Codigo: 0, Mensaje: msg });
  }
};

/**
 * GET /api/gestion/ejecucion-cortes/completados
 */
const consultItemsCompletados = async (req, res) => {
  try {
    const idPerfil = toInt(req.user?.id_perfil);
    const idUsuario = toInt(req.user?.id_usuario);
    const veTodas = idPerfil === 1 || idPerfil === 2;

    let encargado_id = toInt(req.query.encargado_id);
    if (!veTodas) {
      encargado_id = idUsuario;
    } else if (encargado_id == null) {
      encargado_id = 0;
    }

    const buscar = req.query.buscar != null ? String(req.query.buscar) : '';

    const results = await queryAsync(
      'CALL SP_CONSULTAR_ITEMS_COMPLETADOS_EJECUCION(?, ?)',
      [encargado_id || 0, buscar]
    );
    const items = Array.isArray(results?.[0]) ? results[0] : [];

    return res.status(200).json({ items });
  } catch (err) {
    console.error('consultItemsCompletados:', err);
    return res.status(500).json({
      Codigo: 0,
      Mensaje:
        err?.sqlMessage || err?.message || 'Error al consultar completados.',
      items: [],
    });
  }
};

/**
 * GET /api/gestion/ejecucion-cortes/trazabilidad/:id_order_work
 * Cabecera OT + ítems/planos + actas EAV (solo lectura).
 */
const consultTrazabilidadOt = async (req, res) => {
  try {
    const id_order_work = toInt(req.params.id_order_work);
    if (!id_order_work) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'id_order_work es obligatorio.',
        cabecera: null,
        items: [],
        actas: [],
      });
    }

    const results = await queryAsync('CALL SP_CONSULTAR_TRAZABILIDAD_OT(?)', [
      id_order_work,
    ]);

    const cabecera = Array.isArray(results?.[0]) ? results[0][0] || null : null;
    const items = Array.isArray(results?.[1]) ? results[1] : [];
    const actas = Array.isArray(results?.[2]) ? results[2] : [];

    if (!cabecera) {
      return res.status(404).json({
        Codigo: 0,
        Mensaje: 'Orden de trabajo no encontrada.',
        cabecera: null,
        items: [],
        actas: [],
      });
    }

    return res.status(200).json({
      Codigo: 1,
      Mensaje: 'OK',
      cabecera,
      items,
      actas,
    });
  } catch (err) {
    console.error('consultTrazabilidadOt:', err);
    return res.status(500).json({
      Codigo: 0,
      Mensaje:
        err?.sqlMessage || err?.message || 'Error al consultar trazabilidad.',
      cabecera: null,
      items: [],
      actas: [],
    });
  }
};

/** Perfiles que ven todas las ejecuciones (no solo las propias). */
const PERFILES_VE_TODAS = new Set([1, 2, 4, 10]); // Admin, Supervisor, Contabilidad, Sup. obra

const usuarioVeTodas = (req) => PERFILES_VE_TODAS.has(toInt(req.user?.id_perfil));

/**
 * GET /api/gestion/ejecucion-cortes/consult
 * Lista OT pendientes + ejecuciones (completadas/anuladas) con filtros.
 */
const consultEjecucionesCorte = async (req, res) => {
  try {
    const idUsuario = toInt(req.user?.id_usuario);
    const veTodas = usuarioVeTodas(req);

    const buscar =
      req.query.buscar != null ? String(req.query.buscar).trim() : '';
    let encargado_id = toInt(req.query.encargado_id);
    const fecha_desde =
      req.query.fecha_desde != null && String(req.query.fecha_desde).trim()
        ? String(req.query.fecha_desde).trim()
        : null;
    const fecha_hasta =
      req.query.fecha_hasta != null && String(req.query.fecha_hasta).trim()
        ? String(req.query.fecha_hasta).trim()
        : null;

    if (!veTodas) {
      encargado_id = idUsuario;
    } else if (encargado_id == null) {
      encargado_id = 0;
    }

    const results = await queryAsync(
      'CALL SP_CONSULTAR_EJECUCIONES_CORTE(?, ?, ?, ?)',
      [buscar || null, encargado_id || 0, fecha_desde, fecha_hasta]
    );
    const items = Array.isArray(results?.[0]) ? results[0] : [];

    return res.status(200).json({
      Codigo: 1,
      Mensaje: 'OK',
      ve_todas: veTodas,
      items,
    });
  } catch (err) {
    console.error('consultEjecucionesCorte:', err);
    return res.status(500).json({
      Codigo: 0,
      Mensaje:
        err?.sqlMessage || err?.message || 'Error al consultar ejecuciones.',
      ve_todas: false,
      items: [],
    });
  }
};

/**
 * POST /api/gestion/ejecucion-cortes/update
 * Solo admin (perfil 1).
 */
const updateEjecucionCorte = async (req, res) => {
  try {
    if (toInt(req.user?.id_perfil) !== 1) {
      return res.status(403).json({
        Codigo: 0,
        Mensaje: 'Solo un administrador puede editar ejecuciones.',
      });
    }

    const body = req.body || {};
    const id_ejecucion = toInt(body.id_ejecucion);
    const empresa_asociada_id = toInt(body.empresa_asociada_id);
    const encargado_id = toInt(body.encargado_id);
    const tipo_corte = String(body.tipo_corte || '').trim();
    const observaciones =
      body.observaciones != null ? String(body.observaciones) : null;

    if (!id_ejecucion) {
      return res
        .status(400)
        .json({ Codigo: 0, Mensaje: 'id_ejecucion es obligatorio.' });
    }

    const results = await queryAsync(
      'CALL SP_ACTUALIZAR_EJECUCION_CORTE(?, ?, ?, ?, ?)',
      [id_ejecucion, empresa_asociada_id, encargado_id, tipo_corte, observaciones]
    );
    const row = Array.isArray(results?.[0]) ? results[0][0] : results?.[0];

    return res.status(200).json({
      Codigo: Number(row?.Codigo) === 1 ? 1 : 0,
      Mensaje: row?.Mensaje || 'Ejecución actualizada.',
      id_ejecucion: row?.id_ejecucion || id_ejecucion,
    });
  } catch (err) {
    console.error('updateEjecucionCorte:', err);
    return res.status(400).json({
      Codigo: 0,
      Mensaje: err?.sqlMessage || err?.message || 'Error al actualizar.',
    });
  }
};

/**
 * POST /api/gestion/ejecucion-cortes/anular
 * Solo admin (perfil 1).
 */
const anularEjecucionCorte = async (req, res) => {
  try {
    if (toInt(req.user?.id_perfil) !== 1) {
      return res.status(403).json({
        Codigo: 0,
        Mensaje: 'Solo un administrador puede anular ejecuciones.',
      });
    }

    const id_ejecucion = toInt(req.body?.id_ejecucion);
    if (!id_ejecucion) {
      return res
        .status(400)
        .json({ Codigo: 0, Mensaje: 'id_ejecucion es obligatorio.' });
    }

    const results = await queryAsync('CALL SP_ANULAR_EJECUCION_CORTE(?)', [
      id_ejecucion,
    ]);
    const row = Array.isArray(results?.[0]) ? results[0][0] : results?.[0];

    return res.status(200).json({
      Codigo: Number(row?.Codigo) === 1 ? 1 : 0,
      Mensaje: row?.Mensaje || 'Ejecución anulada.',
      id_ejecucion: row?.id_ejecucion || id_ejecucion,
      estado: row?.estado ?? 3,
    });
  } catch (err) {
    console.error('anularEjecucionCorte:', err);
    return res.status(400).json({
      Codigo: 0,
      Mensaje: err?.sqlMessage || err?.message || 'Error al anular.',
    });
  }
};

/**
 * POST /api/gestion/ejecucion-cortes/delete
 * Solo admin (perfil 1). Reabre la OT.
 */
const deleteEjecucionCorte = async (req, res) => {
  try {
    if (toInt(req.user?.id_perfil) !== 1) {
      return res.status(403).json({
        Codigo: 0,
        Mensaje: 'Solo un administrador puede eliminar ejecuciones.',
      });
    }

    const id_ejecucion = toInt(req.body?.id_ejecucion);
    if (!id_ejecucion) {
      return res
        .status(400)
        .json({ Codigo: 0, Mensaje: 'id_ejecucion es obligatorio.' });
    }

    const results = await queryAsync('CALL SP_ELIMINAR_EJECUCION_CORTE(?)', [
      id_ejecucion,
    ]);
    const row = Array.isArray(results?.[0]) ? results[0][0] : results?.[0];

    return res.status(200).json({
      Codigo: Number(row?.Codigo) === 1 ? 1 : 0,
      Mensaje: row?.Mensaje || 'Ejecución eliminada.',
      id_ejecucion: row?.id_ejecucion || id_ejecucion,
      id_order_work: row?.id_order_work || null,
    });
  } catch (err) {
    console.error('deleteEjecucionCorte:', err);
    return res.status(400).json({
      Codigo: 0,
      Mensaje: err?.sqlMessage || err?.message || 'Error al eliminar.',
    });
  }
};

module.exports = {
  finalizarEjecucionCortes,
  consultItemsCompletados,
  guardarAdicionalesOt,
  consultAdicionalesOt,
  consultTrazabilidadOt,
  consultEjecucionesCorte,
  updateEjecucionCorte,
  anularEjecucionCorte,
  deleteEjecucionCorte,
};
