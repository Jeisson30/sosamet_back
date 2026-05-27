const fs = require('fs');
const { runInTransaction } = require('../../utils/dbTransaction');
const {
  insertDocumentFields,
  insertAiuRowsFromSheet,
  insertIvaRowsFromSheet,
} = require('../../services/contractPlano.service');
const { notifyDocumentCreated } = require('../../utils/documentCreatedEmail');

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
  const fileAiu = req.files?.file_aiu?.[0];
  const fileIva = req.files?.file_iva?.[0];
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

    const tipoDocPlano = req.body.tipo_doc_plano || tipo_doc;

    await runInTransaction(async (queryTx) => {
      await insertDocumentFields(queryTx, tipo_doc, numerodoc, campos);

      if (hasAiu) {
        await insertAiuRowsFromSheet(
          queryTx,
          fileAiu.path,
          tipoDocPlano,
          numerodoc,
          { validateContrato: true }
        );
      }

      if (hasIva) {
        await insertIvaRowsFromSheet(
          queryTx,
          fileIva.path,
          tipoDocPlano,
          numerodoc,
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
      numerodoc,
    });

    return response;
  } catch (error) {
    console.error('Error insertContractWithPlano:', error);
    tempFiles.forEach(unlinkSafe);

    return res.status(500).json({
      mensaje:
        'No se guardó el contrato. Ningún dato fue registrado. Verifique el formulario y el archivo plano.',
      error: error.message,
    });
  }
};

module.exports = { insertContractWithPlano };
