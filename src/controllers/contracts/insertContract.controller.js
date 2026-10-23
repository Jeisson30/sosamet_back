const db = require("../../config/db");
const { notifyDocumentCreated } = require("../../utils/documentCreatedEmail");
const {
  assertContratoNumeroNoDuplicado,
} = require("../../services/contratoDocumentoNumero.service");
const { applyUploadedFilesToCampos } = require("../../config/uploadsPath");

const dbp = db.promise();

function parseCampos(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    return JSON.parse(raw);
  }
  return null;
}

const insertContract = async (req, res) => {
  const tipo_doc = req.body?.tipo_doc;
  const numerodoc = req.body?.numerodoc;

  let campos;
  try {
    campos = parseCampos(req.body?.campos);
  } catch {
    return res.status(400).json({
      mensaje: "El campo campos no es válido.",
    });
  }

  if (!tipo_doc || !numerodoc || !Array.isArray(campos)) {
    return res.status(400).json({
      mensaje: "tipo_doc, numerodoc y campos son requeridos.",
    });
  }

  campos = applyUploadedFilesToCampos(campos, req.files);

  const doc = String(numerodoc).trim();
  const tipo = String(tipo_doc).trim();
  const tipoUpper = tipo.toUpperCase();

  try {
    // Actas: evitar choque si dos usuarios abrieron el mismo peek
    if (tipoUpper === "ACTAS DE MEDIDA") {
      const [existing] = await dbp.query(
        `SELECT numerodoc
           FROM item_documentos
          WHERE UPPER(TRIM(tipo_doc)) = 'ACTAS DE MEDIDA'
            AND TRIM(numerodoc) = ?
          LIMIT 1`,
        [doc]
      );
      if (Array.isArray(existing) && existing.length > 0) {
        return res.status(409).json({
          mensaje: `Ya existe un acta con el consecutivo ${doc}. Se asignará el siguiente automáticamente; intente guardar de nuevo.`,
          codigo: "CONSECUTIVO_DUPLICADO",
        });
      }
    }

    // Contratos: avisar si el N° ya existe (confirmación en front); permitir si confirma.
    if (tipoUpper === "CONTRATO") {
      const numeroFromCampos = Array.isArray(campos)
        ? String(
            campos.find(
              (c) =>
                ["numero_contrato", "tipo_doc_contratista"].includes(
                  String(c?.nombre ?? "").toLowerCase()
                ) && String(c?.valor ?? "").trim()
            )?.valor ?? ""
          ).trim()
        : "";
      const numero = numeroFromCampos || doc;
      const confirmarDuplicado =
        req.body?.confirmar_numero_duplicado === true ||
        String(req.body?.confirmar_numero_duplicado ?? "")
          .trim()
          .toLowerCase() === "true" ||
        String(req.body?.confirmar_numero_duplicado ?? "").trim() === "1";
      await assertContratoNumeroNoDuplicado(
        (sql, params) => dbp.query(sql, params).then(([rows]) => rows),
        numero,
        { allowDuplicate: confirmarDuplicado }
      );
    }

    const resultados = [];

    for (const campo of campos) {
      const { nombre, valor } = campo;

      if (!nombre || typeof valor !== "string") {
        resultados.push({
          campo: nombre || "desconocido",
          mensaje: "Campo inválido, se omitió.",
        });
        continue;
      }

      await dbp.execute("CALL sp_insertar_item_documento(?, ?, ?, ?)", [
        tipo,
        doc,
        nombre,
        valor,
      ]);

      resultados.push({
        campo: nombre,
        mensaje: "SE REALIZO LA INSERCION CORRECTAMENTE.",
      });
    }

    res.status(200).json({
      mensaje: `Documento tipo "${tipo}" procesado.`,
      resultados,
    });

    void notifyDocumentCreated({
      reqUser: req.user,
      tipo_doc: tipo,
      numerodoc: doc,
    });
  } catch (error) {
    console.error("❌ Error al insertar campos:", error);
    if (
      error?.statusCode === 409 ||
      error?.codigo === "NUMERO_DUPLICADO_CONFIRMAR" ||
      error?.codigo === "CONSECUTIVO_DUPLICADO"
    ) {
      return res.status(409).json({
        mensaje: error.message,
        codigo: error.codigo || "NUMERO_DUPLICADO_CONFIRMAR",
        requiere_confirmacion: true,
      });
    }
    res.status(500).json({
      mensaje: "Error interno del servidor.",
      error: error.message,
    });
  }
};

module.exports = {
  insertContract,
};
