const XLSX = require('xlsx');

const parseNumber = (value) => {
  if (typeof value === 'string') {
    return parseFloat(
      value.replace(/[^0-9,-.]+/g, '').replace(',', '.')
    );
  }
  return value || 0;
};

const normalize = (str) =>
  str
    ? str
        .toString()
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .replace(/[.\u00B0]/g, '')
    : '';

const getKey = (row, target) => {
  const targetNorm = normalize(target);
  return Object.keys(row).find((key) => normalize(key) === targetNorm);
};

const insertDocumentFields = async (queryTx, tipo_doc, numerodoc, campos) => {
  if (!Array.isArray(campos) || !campos.length) {
    throw new Error('Debe enviar al menos un campo del formulario.');
  }

  for (const campo of campos) {
    const { nombre, valor } = campo;

    if (!nombre || typeof valor !== 'string') {
      throw new Error(`Campo inválido: ${nombre || 'desconocido'}`);
    }

    await queryTx('CALL sp_insertar_item_documento(?, ?, ?, ?)', [
      tipo_doc,
      numerodoc,
      nombre,
      valor,
    ]);
  }
};

const assertContratoCoincide = (numdocExcel, numerodocForm) => {
  const excel = String(numdocExcel ?? '').trim();
  const form = String(numerodocForm ?? '').trim();

  if (!excel || !form || excel === 'SIN_NUMDOC') {
    return;
  }

  if (excel !== form) {
    throw new Error(
      'El número de contrato del archivo plano no coincide con el del formulario.'
    );
  }
};

const insertAiuRowsFromSheet = async (
  queryTx,
  filePath,
  tipo_doc,
  numerodoc,
  options = {}
) => {
  const { validateContrato = false } = options;

  const workbook = XLSX.readFile(filePath);
  if (!workbook.SheetNames.includes('AIU')) {
    throw new Error("La hoja 'AIU' no fue encontrada en el archivo.");
  }

  const aiuData = XLSX.utils.sheet_to_json(workbook.Sheets['AIU']);
  if (!aiuData.length) {
    throw new Error("La hoja 'AIU' está vacía.");
  }

  const numdocExcel =
    aiuData[0][getKey(aiuData[0], 'No CONTRATO')] || 'SIN_NUMDOC';

  if (validateContrato) {
    assertContratoCoincide(numdocExcel, numerodoc);
  }

  const numdoc = validateContrato ? numerodoc : numdocExcel;

  for (const row of aiuData) {
    const item = row[getKey(row, 'ITEM')];
    const vrIva = parseNumber(row[getKey(row, 'VR IVA')]);

    if (
      !item ||
      (typeof item === 'string' && item.toUpperCase().includes('TOTAL')) ||
      isNaN(vrIva)
    ) {
      continue;
    }

    const empresa = row[getKey(row, 'EMPRESA')] || null;

    await queryTx(
      `CALL sp_insertar_aiu(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row[getKey(row, 'ITEM')],
        empresa,
        row[getKey(row, 'INSUMO')],
        row[getKey(row, 'REF')],
        parseNumber(row[getKey(row, 'CANT')]),
        row[getKey(row, 'UM')],
        parseNumber(row[getKey(row, 'ANCHO')]),
        parseNumber(row[getKey(row, 'ALTO')]),
        row[getKey(row, 'DESCRIPCION')],
        parseNumber(row[getKey(row, 'VALOR BASE')]),
        parseNumber(row[getKey(row, '% ADM')]),
        parseNumber(row[getKey(row, 'VR ADM')]),
        parseNumber(row[getKey(row, '% IMP')]),
        parseNumber(row[getKey(row, 'VR IMP')]),
        parseNumber(row[getKey(row, '% UT')]),
        parseNumber(row[getKey(row, 'VR UT')]),
        parseNumber(row[getKey(row, '% IVA')]),
        parseNumber(row[getKey(row, 'VR IVA')]),
        parseNumber(row[getKey(row, 'VR TOTAL')]),
        tipo_doc,
        numdoc,
      ]
    );
  }

  return numdoc;
};

const insertIvaRowsFromSheet = async (
  queryTx,
  filePath,
  tipo_doc,
  numerodoc,
  options = {}
) => {
  const { validateContrato = false } = options;

  const workbook = XLSX.readFile(filePath);
  if (!workbook.SheetNames.includes('IVA')) {
    throw new Error("La hoja 'IVA' no fue encontrada en el archivo.");
  }

  const ivaData = XLSX.utils.sheet_to_json(workbook.Sheets['IVA']);
  if (!ivaData.length) {
    throw new Error("La hoja 'IVA' está vacía.");
  }

  const numdocExcel =
    ivaData[0][getKey(ivaData[0], 'NO CONTRATO')] || 'SIN_NUMDOC';

  if (validateContrato) {
    assertContratoCoincide(numdocExcel, numerodoc);
  }

  const numdoc = validateContrato ? numerodoc : numdocExcel;

  for (const row of ivaData) {
    const item = row[getKey(row, 'ITEM')];
    const vrIva = parseNumber(row[getKey(row, 'VR IVA')]);

    if (
      !item ||
      (typeof item === 'string' && item.toUpperCase().includes('TOTAL')) ||
      isNaN(vrIva)
    ) {
      continue;
    }

    const empresa = row[getKey(row, 'EMPRESA')];

    await queryTx(
      `CALL sp_insertar_iva_pleno(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row[getKey(row, 'ITEM')],
        empresa,
        row[getKey(row, 'INSUMO')],
        row[getKey(row, 'REF')],
        parseNumber(row[getKey(row, 'CANT')]),
        row[getKey(row, 'UM')],
        parseNumber(row[getKey(row, 'ANCHO')]),
        parseNumber(row[getKey(row, 'ALTO')]),
        row[getKey(row, 'DESCRIPCION')],
        parseNumber(row[getKey(row, 'VALOR BASE')]),
        parseNumber(row[getKey(row, '% IVA')]),
        parseNumber(row[getKey(row, 'VR IVA')]),
        parseNumber(row[getKey(row, 'VR TOTAL')]),
        tipo_doc,
        numdoc,
      ]
    );
  }

  return numdoc;
};

module.exports = {
  insertDocumentFields,
  insertAiuRowsFromSheet,
  insertIvaRowsFromSheet,
};
