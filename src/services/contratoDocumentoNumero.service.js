const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const getCampoValor = (campos, nombre) => {
  const row = (campos || []).find(
    (c) => String(c?.nombre ?? '').toLowerCase() === String(nombre).toLowerCase()
  );
  return String(row?.valor ?? '').trim();
};

/**
 * Alinea EAV de CONTRATO: tipo_doc_contratista (N° catálogo) → numero_contrato + numerodoc.
 */
const normalizeContratoCamposBeforeInsert = (
  campos,
  numerodoc,
  tipo_doc_catalogo = ''
) => {
  const numero =
    getCampoValor(campos, 'tipo_doc_contratista') ||
    getCampoValor(campos, 'numero_contrato') ||
    String(numerodoc ?? '').trim();
  const catalogo = String(
    tipo_doc_catalogo || getCampoValor(campos, 'tipo_doc_catalogo') || ''
  ).trim();

  if (!numero) {
    throw new Error('N° Documento es obligatorio.');
  }

  const rest = (campos || []).filter(
    (c) =>
      !['tipo_doc_contratista', 'numero_contrato', 'tipo_doc_catalogo'].includes(
        String(c?.nombre ?? '')
      )
  );

  const extras = [
    { nombre: 'tipo_doc_contratista', valor: numero },
    { nombre: 'numero_contrato', valor: numero },
  ];
  if (catalogo) {
    extras.push({ nombre: 'tipo_doc_catalogo', valor: catalogo });
  }

  return {
    numerodoc: numero,
    campos: [...rest, ...extras],
  };
};

/**
 * Valida contra documento_numero + evita duplicar contrato con el mismo N°.
 * Usa SP_VALIDAR_DOCUMENTO_NUMERO_CONTRATO si existe; si no, fallback en JS.
 */
const validateContratoDocumentoNumero = async (
  queryTx,
  { campos, numerodoc, tipo_doc_catalogo }
) => {
  const numero =
    getCampoValor(campos, 'tipo_doc_contratista') ||
    getCampoValor(campos, 'numero_contrato') ||
    String(numerodoc ?? '').trim();
  const tipoDoc = String(tipo_doc_catalogo ?? '').trim();
  const constructora = getCampoValor(campos, 'empresa');
  const proyecto = getCampoValor(campos, 'proyecto');

  if (!numero) {
    throw new Error('N° Documento es obligatorio.');
  }
  if (!tipoDoc) {
    throw new Error(
      'Tipo documento (Contrato, Cotización, Orden de Compra…) es obligatorio.'
    );
  }
  if (!constructora || !proyecto) {
    throw new Error('Constructora y proyecto son obligatorios.');
  }

  try {
    const spRows = await queryTx(
      'CALL SP_VALIDAR_DOCUMENTO_NUMERO_CONTRATO(?, ?, ?, ?)',
      [numero, tipoDoc, constructora, proyecto]
    );
    const msg = spRows?.[0]?.[0]?.mensaje;
    if (msg && String(msg).trim() !== 'OK') {
      throw new Error(String(msg).trim());
    }
    return;
  } catch (err) {
    if (err?.code === 'ER_SP_DOES_NOT_EXIST' || err?.errno === 1305) {
      await validateContratoDocumentoNumeroFallback(queryTx, {
        numero,
        tipoDoc,
        constructora,
        proyecto,
      });
      return;
    }
    throw err;
  }
};

const validateContratoDocumentoNumeroFallback = async (
  queryTx,
  { numero, tipoDoc, constructora, proyecto }
) => {
  const rows = await queryTx(
    `SELECT
        D.numero_documento,
        D.tipo_doc,
        D.estado,
        C.nombre AS constructora,
        P.nombre AS proyecto
      FROM documento_numero D
      INNER JOIN constructoras C ON C.id_constructora = D.id_constructora
      INNER JOIN proyectos_constructoras P ON P.id_proyecto = D.id_proyecto
      WHERE TRIM(D.numero_documento) COLLATE utf8mb4_general_ci = ?
      LIMIT 1`,
    [numero]
  );

  const doc = rows?.[0];
  if (!doc) {
    throw new Error(
      `El N° Documento "${numero}" no existe en el catálogo de administración.`
    );
  }
  if (String(doc.estado || '').toUpperCase() !== 'ACTIVO') {
    throw new Error(
      `El N° Documento "${numero}" está inactivo. Actívelo en administración o elija otro.`
    );
  }
  if (normalizeText(doc.tipo_doc) !== normalizeText(tipoDoc)) {
    throw new Error(
      `El N° "${numero}" corresponde al tipo "${doc.tipo_doc}", no a "${tipoDoc}".`
    );
  }
  if (normalizeText(doc.constructora) !== normalizeText(constructora)) {
    throw new Error(
      `El N° "${numero}" pertenece a la constructora "${doc.constructora}", no a "${constructora}".`
    );
  }
  if (normalizeText(doc.proyecto) !== normalizeText(proyecto)) {
    throw new Error(
      `El N° "${numero}" pertenece al proyecto "${doc.proyecto}", no a "${proyecto}".`
    );
  }

  const dup = await queryTx(
    `SELECT numerodoc
       FROM item_documentos
      WHERE UPPER(TRIM(tipo_doc)) COLLATE utf8mb4_general_ci = 'CONTRATO'
        AND LOWER(nombre_campo_doc) COLLATE utf8mb4_general_ci = 'numero_contrato'
        AND TRIM(valor_campo_doc) COLLATE utf8mb4_general_ci = ?
      LIMIT 1`,
    [numero]
  );

  if (dup?.length) {
    throw new Error(
      `Ya existe un contrato registrado con el N° Documento "${numero}".`
    );
  }
};

module.exports = {
  getCampoValor,
  normalizeContratoCamposBeforeInsert,
  validateContratoDocumentoNumero,
};
