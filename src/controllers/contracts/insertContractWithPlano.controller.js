const fs = require('fs');
const { runInTransaction } = require('../../utils/dbTransaction');
const {
  insertDocumentFields,
  insertAiuRowsFromSheet,
  insertIvaRowsFromSheet,
} = require('../../services/contractPlano.service');
const {
  normalizeContratoCamposBeforeInsert,
  validateContratoDocumentoNumero,
} = require('../../services/contratoDocumentoNumero.service');
const { notifyDocumentCreated } = require('../../utils/documentCreatedEmail');
const { applyUploadedFilesToCampos } = require('../../config/uploadsPath');

const unlinkSafe = (filePath) => {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
};

const parseCampos = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }
  throw new Error('Formato de campos inválido.');
};

/**
 * Inserta formulario + archivo(s) plano en una sola transacción.
 * Regla: no se permite formulario de CONTRATO sin al menos un archivo AIU o IVA.
 */
const insertContractWithPlano = async (req, res) => {
  const tipo_doc = req.body?.tipo_doc;
  const numerodoc = req.body?.numerodoc;
  const allFiles = Array.isArray(req.files) ? req.files : [];
  const fileAiu = allFiles.find((f) => f.fieldname === 'file_aiu') || null;
  const fileIva = allFiles.find((f) => f.fieldname === 'file_iva') || null;
  const tempFiles = [fileAiu?.path, fileIva?.path].filter(Boolean);

  try {
    if (!tipo_doc || !numerodoc) {
      return res.status(400).json({
        mensaje: 'tipo_doc y numerodoc son requeridos.',
      });
    }

    let campos;
    try {
      campos = parseCampos(req.body.campos);
    } catch {
      return res.status(400).json({ mensaje: 'El campo campos no es válido.' });
    }

    // Adjuntos EAV (foto1, PDF, etc.): no confundir con file_aiu / file_iva
    campos = applyUploadedFilesToCampos(campos, allFiles);

    const isContrato =
      String(tipo_doc).trim().toUpperCase() === 'CONTRATO';
    const hasAiu = !!fileAiu;
    const hasIva = !!fileIva;
    const hasPlano = hasAiu || hasIva;

    if (isContrato && !hasPlano) {
      return res.status(400).json({
        mensaje:
          'Para guardar el contrato debe adjuntar al menos un archivo AIU o IVA.',
      });
    }

    if (!hasPlano) {
      return res.status(400).json({
        mensaje: 'Debe adjuntar al menos un archivo plano (AIU o IVA).',
      });
    }

    const tipoDocCatalogo = String(req.body?.tipo_doc_catalogo ?? '').trim();
    const tipoDocPlano =
      String(req.body?.tipo_doc_plano ?? '').trim() ||
      tipoDocCatalogo ||
      tipo_doc;

    let camposNormalizados = campos;
    let numerodocFinal = numerodoc;

    if (isContrato) {
      const norm = normalizeContratoCamposBeforeInsert(
        campos,
        numerodoc,
        tipoDocCatalogo
      );
      camposNormalizados = norm.campos;
      numerodocFinal = norm.numerodoc;
    }

    const confirmarDuplicado =
      String(req.body?.confirmar_numero_duplicado ?? '')
        .trim()
        .toLowerCase() === 'true' ||
      String(req.body?.confirmar_numero_duplicado ?? '').trim() === '1';

    await runInTransaction(async (queryTx) => {
      if (isContrato) {
        await validateContratoDocumentoNumero(queryTx, {
          campos: camposNormalizados,
          numerodoc: numerodocFinal,
          tipo_doc_catalogo: tipoDocCatalogo,
          allowDuplicate: confirmarDuplicado,
        });
      }

      await insertDocumentFields(
        queryTx,
        tipo_doc,
        numerodocFinal,
        camposNormalizados
      );

      if (hasAiu) {
        await insertAiuRowsFromSheet(
          queryTx,
          fileAiu.path,
          tipoDocPlano,
          numerodocFinal,
          { validateContrato: true }
        );
      }

      if (hasIva) {
        await insertIvaRowsFromSheet(
          queryTx,
          fileIva.path,
          tipoDocPlano,
          numerodocFinal,
          { validateContrato: true }
        );
      }
    });

    tempFiles.forEach(unlinkSafe);

    const response = res.status(200).json({
      mensaje: 'Contrato y archivo plano guardados correctamente.',
    });

    void notifyDocumentCreated({
      reqUser: req.user,
      tipo_doc,
      numerodoc: numerodocFinal,
    });

    return response;
  } catch (error) {
    console.error('Error insertContractWithPlano:', error);
    tempFiles.forEach(unlinkSafe);

    if (
      error?.statusCode === 409 ||
      error?.codigo === 'NUMERO_DUPLICADO_CONFIRMAR' ||
      error?.codigo === 'CONSECUTIVO_DUPLICADO'
    ) {
      return res.status(409).json({
        mensaje: error.message,
        codigo: error.codigo || 'NUMERO_DUPLICADO_CONFIRMAR',
        requiere_confirmacion:
          error.codigo === 'NUMERO_DUPLICADO_CONFIRMAR' ||
          error.codigo === 'CONSECUTIVO_DUPLICADO',
      });
    }

    const isValidation =
      error?.sqlState === '45000' ||
      error?.errno === 1644 ||
      error?.statusCode === 400;
    const text = String(
      error.sqlMessage || error.message || ''
    ).trim();
    if (/ya existe/i.test(text)) {
      return res.status(409).json({
        mensaje: text.includes('¿Desea')
          ? text
          : `${text} ¿Desea crear otro con el mismo número?`,
        codigo: 'NUMERO_DUPLICADO_CONFIRMAR',
        requiere_confirmacion: true,
      });
    }

    return res.status(isValidation ? 400 : 500).json({
      mensaje:
        text ||
        'No se guardó el contrato. Ningún dato fue registrado. Verifique el formulario y el archivo plano.',
      error: error.message,
    });
  }
};

module.exports = { insertContractWithPlano };
