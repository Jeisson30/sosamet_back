const db = require('../../config/db');

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

/**
 * POST /api/administracion/documentos-numero
 * Body: { id_constructora, id_proyecto, tipo_doc, numero_documento }
 */
const crearDocumentoNumero = async (req, res) => {
  try {
    const id_constructora = Number(req.body?.id_constructora);
    const id_proyecto = Number(req.body?.id_proyecto);
    const tipo_doc = String(req.body?.tipo_doc || '').trim();
    const numero_documento = String(req.body?.numero_documento || '').trim();

    if (!id_constructora || !id_proyecto || !tipo_doc || !numero_documento) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje:
          'id_constructora, id_proyecto, tipo_doc y numero_documento son obligatorios.',
      });
    }

    const proy = await queryAsync(
      `SELECT id_proyecto, id_constructora, nombre, estado
         FROM proyectos_constructoras
        WHERE id_proyecto = ?
        LIMIT 1`,
      [id_proyecto]
    );
    if (!proy?.length) {
      return res.status(404).json({
        Codigo: 0,
        Mensaje: 'El proyecto no existe.',
      });
    }
    if (Number(proy[0].id_constructora) !== id_constructora) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'El proyecto no pertenece a la constructora seleccionada.',
      });
    }
    if (String(proy[0].estado || '').toUpperCase() !== 'ACTIVO') {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'El proyecto debe estar ACTIVO.',
      });
    }

    const dup = await queryAsync(
      `SELECT id_documento_numero
         FROM documento_numero
        WHERE TRIM(numero_documento) = ?
        LIMIT 1`,
      [numero_documento]
    );
    if (dup?.length) {
      return res.status(409).json({
        Codigo: 0,
        Mensaje: `Ya existe el N° documento "${numero_documento}". Debe ser único.`,
      });
    }

    const result = await queryAsync(
      `INSERT INTO documento_numero
         (id_constructora, id_proyecto, tipo_doc, numero_documento, estado)
       VALUES (?, ?, ?, ?, 'ACTIVO')`,
      [id_constructora, id_proyecto, tipo_doc, numero_documento]
    );

    return res.status(201).json({
      Codigo: 1,
      Mensaje: 'N° documento registrado correctamente.',
      data: {
        id_documento_numero: result.insertId,
        id_constructora,
        id_proyecto,
        tipo_doc,
        numero_documento,
      },
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        Codigo: 0,
        Mensaje: 'Ya existe ese N° documento. Debe ser único.',
      });
    }
    console.error('crearDocumentoNumero:', error);
    return res.status(500).json({
      Codigo: 0,
      Mensaje: 'Error al registrar N° documento.',
      error: error.message,
    });
  }
};

/**
 * GET /api/administracion/documentos-numero
 * Query: id_constructora?, id_proyecto?, tipo_doc?, estado?=ACTIVO
 */
const listarDocumentosNumero = async (req, res) => {
  try {
    const id_constructora = req.query?.id_constructora
      ? Number(req.query.id_constructora)
      : null;
    const id_proyecto = req.query?.id_proyecto
      ? Number(req.query.id_proyecto)
      : null;
    const tipo_doc = String(req.query?.tipo_doc || '').trim();
    const estado = String(req.query?.estado || 'ACTIVO')
      .trim()
      .toUpperCase();

    const where = [];
    const params = [];

    if (estado && estado !== 'TODOS') {
      where.push(`D.estado = ?`);
      params.push(estado);
    }
    if (id_constructora) {
      where.push(`D.id_constructora = ?`);
      params.push(id_constructora);
    }
    if (id_proyecto) {
      where.push(`D.id_proyecto = ?`);
      params.push(id_proyecto);
    }
    if (tipo_doc) {
      where.push(`D.tipo_doc COLLATE utf8mb4_general_ci = ?`);
      params.push(tipo_doc);
    }

    const sql = `
      SELECT
        D.id_documento_numero,
        D.id_constructora,
        C.nombre AS constructora,
        D.id_proyecto,
        P.nombre AS proyecto,
        D.tipo_doc,
        D.numero_documento,
        D.estado,
        D.fecha_creacion,
        D.numero_documento AS label,
        D.numero_documento AS value
      FROM documento_numero D
      INNER JOIN constructoras C ON C.id_constructora = D.id_constructora
      INNER JOIN proyectos_constructoras P ON P.id_proyecto = D.id_proyecto
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY D.fecha_creacion DESC, D.numero_documento ASC
    `;

    const rows = await queryAsync(sql, params);
    return res.status(200).json({
      Codigo: 1,
      Mensaje: 'OK',
      data: rows || [],
    });
  } catch (error) {
    console.error('listarDocumentosNumero:', error);
    return res.status(500).json({
      Codigo: 0,
      Mensaje: 'Error al listar N° documentos.',
      error: error.message,
      data: [],
    });
  }
};

/**
 * PATCH /api/administracion/documentos-numero/:idDocumentoNumero/estado
 * Body: { estado: 'ACTIVO' | 'INACTIVO' }
 */
const cambiarEstadoDocumentoNumero = async (req, res) => {
  try {
    const id = Number(req.params.idDocumentoNumero);
    const estado = String(req.body?.estado || '')
      .trim()
      .toUpperCase();

    if (!id || !Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'Id de N° documento inválido.',
      });
    }
    if (!['ACTIVO', 'INACTIVO'].includes(estado)) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'Estado debe ser ACTIVO o INACTIVO.',
      });
    }

    const existing = await queryAsync(
      `SELECT id_documento_numero, numero_documento, estado
         FROM documento_numero
        WHERE id_documento_numero = ?
        LIMIT 1`,
      [id]
    );
    if (!existing?.length) {
      return res.status(404).json({
        Codigo: 0,
        Mensaje: 'N° documento no encontrado.',
      });
    }

    await queryAsync(
      `UPDATE documento_numero SET estado = ? WHERE id_documento_numero = ?`,
      [estado, id]
    );

    return res.status(200).json({
      Codigo: 1,
      Mensaje:
        estado === 'INACTIVO'
          ? 'N° documento inactivado. Ya no aparecerá en los formularios.'
          : 'N° documento activado.',
      data: {
        id_documento_numero: id,
        numero_documento: existing[0].numero_documento,
        estado,
      },
    });
  } catch (error) {
    console.error('cambiarEstadoDocumentoNumero:', error);
    return res.status(500).json({
      Codigo: 0,
      Mensaje: 'Error al actualizar estado del N° documento.',
      error: error.message,
    });
  }
};

/**
 * PUT /api/administracion/documentos-numero/:idDocumentoNumero
 * Body: { id_constructora, id_proyecto, tipo_doc, numero_documento, estado? }
 */
const actualizarDocumentoNumero = async (req, res) => {
  try {
    const id = Number(req.params.idDocumentoNumero);
    const id_constructora = Number(req.body?.id_constructora);
    const id_proyecto = Number(req.body?.id_proyecto);
    const tipo_doc = String(req.body?.tipo_doc || '').trim();
    const numero_documento = String(req.body?.numero_documento || '').trim();
    const estadoRaw = String(req.body?.estado || '').trim().toUpperCase();
    const estado = estadoRaw || null;

    if (!id || !Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'Id de N° documento inválido.',
      });
    }
    if (!id_constructora || !id_proyecto || !tipo_doc || !numero_documento) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje:
          'id_constructora, id_proyecto, tipo_doc y numero_documento son obligatorios.',
      });
    }
    if (estado && !['ACTIVO', 'INACTIVO'].includes(estado)) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'Estado debe ser ACTIVO o INACTIVO.',
      });
    }

    const existing = await queryAsync(
      `SELECT id_documento_numero, numero_documento
         FROM documento_numero
        WHERE id_documento_numero = ?
        LIMIT 1`,
      [id]
    );
    if (!existing?.length) {
      return res.status(404).json({
        Codigo: 0,
        Mensaje: 'N° documento no encontrado.',
      });
    }

    const proy = await queryAsync(
      `SELECT id_proyecto, id_constructora, estado
         FROM proyectos_constructoras
        WHERE id_proyecto = ?
        LIMIT 1`,
      [id_proyecto]
    );
    if (!proy?.length) {
      return res.status(404).json({
        Codigo: 0,
        Mensaje: 'El proyecto no existe.',
      });
    }
    if (Number(proy[0].id_constructora) !== id_constructora) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'El proyecto no pertenece a la constructora seleccionada.',
      });
    }

    const dup = await queryAsync(
      `SELECT id_documento_numero
         FROM documento_numero
        WHERE TRIM(numero_documento) = ?
          AND id_documento_numero <> ?
        LIMIT 1`,
      [numero_documento, id]
    );
    if (dup?.length) {
      return res.status(409).json({
        Codigo: 0,
        Mensaje: `Ya existe el N° documento "${numero_documento}". Debe ser único.`,
      });
    }

    if (estado) {
      await queryAsync(
        `UPDATE documento_numero
            SET id_constructora = ?,
                id_proyecto = ?,
                tipo_doc = ?,
                numero_documento = ?,
                estado = ?
          WHERE id_documento_numero = ?`,
        [id_constructora, id_proyecto, tipo_doc, numero_documento, estado, id]
      );
    } else {
      await queryAsync(
        `UPDATE documento_numero
            SET id_constructora = ?,
                id_proyecto = ?,
                tipo_doc = ?,
                numero_documento = ?
          WHERE id_documento_numero = ?`,
        [id_constructora, id_proyecto, tipo_doc, numero_documento, id]
      );
    }

    return res.status(200).json({
      Codigo: 1,
      Mensaje: 'N° documento actualizado.',
      data: {
        id_documento_numero: id,
        id_constructora,
        id_proyecto,
        tipo_doc,
        numero_documento,
        estado: estado || undefined,
      },
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        Codigo: 0,
        Mensaje: 'Ya existe ese N° documento. Debe ser único.',
      });
    }
    console.error('actualizarDocumentoNumero:', error);
    return res.status(500).json({
      Codigo: 0,
      Mensaje: 'Error al actualizar N° documento.',
      error: error.message,
    });
  }
};

/**
 * DELETE /api/administracion/documentos-numero/:idDocumentoNumero
 * Solo si el N° NO está referenciado en documentos operativos.
 * Si ya se usó → 409 (usar inactivar). DELETE físico libera unicidad.
 */
const eliminarDocumentoNumero = async (req, res) => {
  try {
    const id = Number(req.params.idDocumentoNumero);
    if (!id || !Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        Codigo: 0,
        Mensaje: 'Id de N° documento inválido.',
      });
    }

    const existing = await queryAsync(
      `SELECT id_documento_numero, numero_documento, estado
         FROM documento_numero
        WHERE id_documento_numero = ?
        LIMIT 1`,
      [id]
    );
    if (!existing?.length) {
      return res.status(404).json({
        Codigo: 0,
        Mensaje: 'N° documento no encontrado.',
      });
    }

    const numero = String(existing[0].numero_documento || '').trim();

    // ¿Ya se usó como N° Documento en cabeceras EAV?
    const usadosEav = await queryAsync(
      `SELECT tipo_doc, numerodoc, nombre_campo_doc
         FROM item_documentos
        WHERE TRIM(valor_campo_doc) = ?
          AND nombre_campo_doc IN (
            'tipo_doc_rem',
            'tipo_doc',
            'tipo_doc_acta',
            'am_tipo_doc',
            'tipo_documento',
            'tipo_documento_acta',
            'tipo_documento_actap',
            'tipo_doc_contratista',
            'numero_contrato'
          )
        LIMIT 5`,
      [numero]
    );

    // ¿Ya se usó en OT?
    let usadosOt = [];
    try {
      usadosOt = await queryAsync(
        `SELECT id_order_work, consecutivo
           FROM order_work
          WHERE TRIM(IFNULL(ot_tipo_documento, '')) = ?
          LIMIT 5`,
        [numero]
      );
    } catch (_) {
      // Columna/tabla puede no existir en algún entorno; no bloquea por eso.
      usadosOt = [];
    }

    if ((usadosEav && usadosEav.length) || (usadosOt && usadosOt.length)) {
      return res.status(409).json({
        Codigo: 0,
        Mensaje:
          `El N° "${numero}" ya está asociado a documentos operativos. ` +
          `No se puede eliminar; inactívelo para que no aparezca en los formularios.`,
        en_uso: true,
        referencias: {
          item_documentos: (usadosEav || []).map((r) => ({
            tipo_doc: r.tipo_doc,
            numerodoc: r.numerodoc,
            campo: r.nombre_campo_doc,
          })),
          order_work: (usadosOt || []).map((r) => ({
            id_order_work: r.id_order_work,
            consecutivo: r.consecutivo,
          })),
        },
      });
    }

    await queryAsync(
      `DELETE FROM documento_numero WHERE id_documento_numero = ?`,
      [id]
    );

    return res.status(200).json({
      Codigo: 1,
      Mensaje: `N° documento "${numero}" eliminado. Quedó libre para registrarse de nuevo.`,
      data: {
        id_documento_numero: id,
        numero_documento: numero,
      },
    });
  } catch (error) {
    console.error('eliminarDocumentoNumero:', error);
    return res.status(500).json({
      Codigo: 0,
      Mensaje: 'Error al eliminar N° documento.',
      error: error.message,
    });
  }
};

module.exports = {
  crearDocumentoNumero,
  listarDocumentosNumero,
  cambiarEstadoDocumentoNumero,
  actualizarDocumentoNumero,
  eliminarDocumentoNumero,
};
