const XLSX = require("xlsx");
const fs = require("fs");
const db = require("../../config/db");

// Función para ejecutar queries con promesas
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

// Encuentra la clave real de una columna en la fila
const getKey = (row, target) => {
  const targetNorm = normalize(target);
  return Object.keys(row).find((key) => normalize(key) === targetNorm);
};

// Controlador principal para subir archivo de Remisiones
const uploadExcelRemisiones = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó un archivo." });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetNames = workbook.SheetNames;

    console.log("Hojas encontradas:", sheetNames);

    // Toma la primera hoja (ya que no se especifica un nombre fijo)
    const sheet = workbook.Sheets[sheetNames[0]];
    const remisionesData = XLSX.utils.sheet_to_json(sheet);

    if (!remisionesData || remisionesData.length === 0) {
      return res.status(400).json({ error: "El archivo está vacío." });
    }

    const tipo_doc = req.body.tipo_doc || "Remisión";

    for (const row of remisionesData) {
      const item = row[getKey(row, "ITEM")];
      const contrato = row[getKey(row, "NO CONTRATO")];
      const empresa = row[getKey(row, "EMPRESA")];
      const cantidad = row[getKey(row, "CANTIDAD")];
      const um = row[getKey(row, "UM")];
      const detalle = row[getKey(row, "DETALLE")];
      const observaciones = row[getKey(row, "OBSERVACIONES")];

      // Validaciones básicas
      if (!item || !contrato) {
        console.warn("⚠️ Fila ignorada por datos incompletos:", row);
        continue;
      }

      const values = [
        contrato,
        empresa || null,
        item,
        cantidad,
        um,
        detalle,
        observaciones,
        tipo_doc,
      ];

      await ejecutarQuery(
        `CALL sp_insertar_remisiones_plano(?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }

    // Eliminar el archivo temporal luego de procesarlo
    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: "Archivo de remisiones procesado e insertado correctamente.",
    });
  } catch (error) {
    console.error("Error al procesar archivo de remisiones:", error);
    res.status(500).json({
      error: "Error al procesar archivo de remisiones",
      detalle: error.message,
    });
  }
};

module.exports = { uploadExcelRemisiones };
