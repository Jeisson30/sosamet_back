const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
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

// Función para sanitizar y convertir valores numéricos
const parseNumber = (value) => {
  if (typeof value === "string") {
    return parseFloat(value.replace(/[^0-9.-]+/g, ""));
  }
  return value;
};

// Función principal para subir archivo
const uploadExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó un archivo." });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetNames = workbook.SheetNames;
    console.log("Hojas encontradas:", sheetNames);

    if (!sheetNames.includes("AIU")) {
      return res.status(400).json({ error: "La hoja 'AIU' no fue encontrada en el archivo." });
    }

    const aiuSheet = workbook.Sheets["AIU"];
    const aiuData = XLSX.utils.sheet_to_json(aiuSheet);

    if (!aiuData || aiuData.length === 0) {
      return res.status(400).json({ error: "La hoja 'AIU' está vacía." });
    }

    // Detectar la clave de la columna REF (puede tener espacios u otros caracteres)
    const refKey = Object.keys(aiuData[0]).find(key => key.trim().toUpperCase() === "REF");

    if (!refKey) {
      return res.status(400).json({ error: "No se encontró la columna 'REF' en la hoja 'AIU'." });
    }

    const numdoc = aiuData[0][refKey] || "SIN_NUMDOC";
    const tipo_doc = req.body.tipo_doc || "Contrato";

    console.log("Clave REF encontrada:", refKey);
    console.log("Valor numdoc (desde columna REF):", numdoc);

    for (const row of aiuData) {
      const getKey = (target) =>
        Object.keys(row).find(
          (key) => key.trim().toUpperCase() === target.toUpperCase()
        );

      const item = row[getKey("ITEM")];
      const vrIva = parseNumber(row[getKey("VR IVA")]);

      // Validaciones para omitir filas inválidas o de totales
      if (
        !item ||
        (typeof item === "string" && item.toUpperCase().includes("TOTAL")) ||
        isNaN(vrIva)
      ) {
        console.warn("Fila ignorada (inválida o TOTAL):", row);
        continue;
      }

      const values = [
        row[getKey("ITEM")],
        row[getKey("REF")],
        parseNumber(row[getKey("CANT")]),
        row[getKey("UND")],
        parseNumber(row[getKey("ANCHO")]),
        parseNumber(row[getKey("ALTO")]),
        row[getKey("DESCRIPCION")],
        parseNumber(row[getKey("VALOR BASE")]),
        parseNumber(row[getKey("% ADM")]),
        parseNumber(row[getKey("VR ADM")]),
        parseNumber(row[getKey("% IMP")]),
        parseNumber(row[getKey("VR IMP")]),
        parseNumber(row[getKey("% UT")]),
        parseNumber(row[getKey("VR UT")]),
        parseNumber(row[getKey("% IVA")]),
        parseNumber(row[getKey("VR IVA")]),
        parseNumber(row[getKey("VR.  TOTAL")]),
        tipo_doc,
        numdoc,
      ];

      await ejecutarQuery(
        `CALL sp_insertar_aiu(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }

    fs.unlinkSync(req.file.path); // Eliminar archivo temporal
    res.status(200).json({ message: "Archivo procesado y datos insertados correctamente." });

  } catch (error) {
    console.error("Error al procesar archivo Excel:", error);
    res.status(500).json({ error: "Error al procesar archivo Excel", detalle: error.message });
  }
};

module.exports = { uploadExcel };
