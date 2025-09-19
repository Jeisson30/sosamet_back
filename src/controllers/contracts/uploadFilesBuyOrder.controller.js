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

// Normaliza cabeceras (ignora mayúsculas, espacios, puntos, º)
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

// Función principal para subir archivo Orden de Compra
const uploadExcelOrder = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó un archivo." });
    }

    const workbook = XLSX.readFile(req.file.path);
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (!data || data.length === 0) {
      return res.status(400).json({ error: "El archivo de Orden de Compra está vacío." });
    }

    const expectedHeaders = [
      "CONTRATO",
      "ITEM",
      "ELEMENTO",
      "DESCRIPCION",
      "UM",
      "CANTIDAD",
      "PROVEEDOR",
    ];

    const headersFromFile = Object.keys(data[0]).map((h) => normalize(h));
    const isValid = expectedHeaders.every(
      (h) => headersFromFile.includes(normalize(h))
    );

    if (!isValid) {
      return res.status(400).json({
        error: "Formato inválido. El archivo no corresponde a una Orden de Compra.",
      });
    }

    // Obtener número de contrato de la primera fila
    const numdoc = data[0][getKey(data[0], "CONTRATO")] || "SIN_NUMDOC";
    const tipo_doc = req.body.tipo_doc || "Orden De Compra";

    console.log("Número de contrato detectado:", numdoc);

    for (const row of data) {
      const contrato = row[getKey(row, "CONTRATO")];
      const item = row[getKey(row, "ITEM")];
      const elemento = row[getKey(row, "ELEMENTO")];
      const descripcion = row[getKey(row, "DESCRIPCION")];
      const um = row[getKey(row, "UM")];
      const cantidad = row[getKey(row, "CANTIDAD")];
      const proveedor = row[getKey(row, "PROVEEDOR")];

      if (!item || !descripcion) {
        console.warn("Fila ignorada (incompleta):", row);
        continue;
      }

      const values = [
        contrato,
        item,
        elemento,
        descripcion,
        um,
        cantidad,
        proveedor,
        tipo_doc,
        numdoc,
      ];

      await ejecutarQuery(`CALL sp_insertar_orden_compra(?, ?, ?, ?, ?, ?, ?, ?, ?)`, values);
    }

    fs.unlinkSync(req.file.path);
    res.status(200).json({
      message: "Archivo de Orden de Compra procesado e insertado correctamente.",
    });
    console.log('orden cargada correctamtnte', numdoc);
    
  } catch (error) {
    console.error("Error al procesar archivo de Orden de Compra:", error);
    res.status(500).json({
      error: "Error al procesar archivo de Orden de Compra",
      detalle: error.message,
    });
  }
};

module.exports = { uploadExcelOrder };
