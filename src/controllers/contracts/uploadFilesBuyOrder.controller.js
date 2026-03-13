const XLSX = require("xlsx");
const fs = require("fs");
const db = require("../../config/db");

// Ejecutar queries con promesas
const ejecutarQuery = (sql, values) => {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error al ejecutar consulta:", err);
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

// Normaliza cabeceras
const normalize = (str) =>
  str
    ? str
        .toString()
        .trim()
        .toUpperCase()
        .replace(/\s+/g, " ")
        .replace(/[.\u00B0]/g, "")
    : "";

// Encuentra la clave real de una columna
const getKey = (row, target) => {
  const targetNorm = normalize(target);
  return Object.keys(row).find((key) => normalize(key) === targetNorm);
};

// Subir archivo Orden de Compra
const uploadExcelOrder = async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó un archivo." });
    }

    const consecutivo = req.body.consecutivo;
    const tipo_doc = req.body.tipo_doc || "Orden De Compra";

    if (!consecutivo) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: "Debe proporcionar el consecutivo del documento."
      });
    }

    // Validar consecutivo
    const existe = await ejecutarQuery(
      `SELECT COUNT(*) AS total
       FROM item_documentos
       WHERE tipo_doc = ?
       AND nombre_campo_doc = 'consecutivo'
       AND valor_campo_doc = ?`,
      [tipo_doc, consecutivo]
    );

    if (existe[0].total > 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: "Ya existe un documento registrado con este mismo consecutivo. Por favor, verifica el número e intenta nuevamente."
      });
    }

    const numdoc = consecutivo;

    const workbook = XLSX.readFile(req.file.path);
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (!data || data.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: "El archivo de Orden de Compra está vacío."
      });
    }

    const expectedHeaders = [
      "CONTRATO",
      "ITEM",
      "ELEMENTO",
      "DESCRIPCION",
      "UBICACION",
      "CANTIDAD",
      "UM",
      "BASE",
      "ALTURA", 
      "TOTAL",
      "OTROS",
      "PROVEDOR"
    ];

    const headersFromFile = Object.keys(data[0]).map((h) => normalize(h));

    const isValid = expectedHeaders.every(
      (h) => headersFromFile.includes(normalize(h))
    );

    if (!isValid) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: "Formato inválido. El archivo no corresponde a una Orden de Compra."
      });
    }

    for (const row of data) {

      const contrato = row[getKey(row, "CONTRATO")];
      const item = row[getKey(row, "ITEM")];
      const elemento = row[getKey(row, "ELEMENTO")];
      const descripcion = row[getKey(row, "DESCRIPCION")];
      const ubicacion = row[getKey(row, "UBICACION")];
      const cantidad = row[getKey(row, "CANTIDAD")];
      const um = row[getKey(row, "UM")];
      const base = row[getKey(row, "BASE")];
      const altura = row[getKey(row, "ALTURA")];
      const total = row[getKey(row, "TOTAL")];
      const otros = row[getKey(row, "OTROS")];
      const proveedor = row[getKey(row, "PROVEDOR")];

      if (!item || !descripcion) {
        console.warn("Fila ignorada:", row);
        continue;
      }

      const values = [
        contrato,
        item,
        elemento,
        descripcion,
        ubicacion,
        um,
        base,
        altura,
        total,
        otros,
        cantidad,
        proveedor,
        tipo_doc,
        numdoc
      ];

      await ejecutarQuery(
        `CALL sp_insertar_orden_compra(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }

    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: "Archivo de Orden de Compra procesado e insertado correctamente."
    });

    console.log("Orden cargada correctamente:", numdoc);

  } catch (error) {
    console.error("Error al procesar archivo:", error);

    res.status(500).json({
      error: "Error al procesar archivo de Orden de Compra",
      detalle: error.message
    });
  }
};

module.exports = { uploadExcelOrder };