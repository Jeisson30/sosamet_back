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

// Función para sanitizar y convertir valores numéricos
const parseNumber = (value) => {
  if (typeof value === "string") {
    return parseFloat(value.replace(/[^0-9.-]+/g, ""));
  }
  return value || 0;
};

// Función más robusta para encontrar columnas (ignora mayúsculas, espacios y puntos)
const getKey = (row, target) => {
  const normalize = (str) =>
    str
      ? str.trim().toUpperCase().replace(/\s+/g, " ").replace(/\./g, "")
      : "";

  const targetNorm = normalize(target);

  return Object.keys(row).find((key) => normalize(key) === targetNorm);
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
      return res
        .status(400)
        .json({ error: "La hoja 'AIU' no fue encontrada en el archivo." });
    }

    const aiuSheet = workbook.Sheets["AIU"];
    const aiuData = XLSX.utils.sheet_to_json(aiuSheet);

    if (!aiuData || aiuData.length === 0) {
      return res
        .status(400)
        .json({ error: "La hoja 'AIU' está vacía." });
    }

    // Obtener el número de contrato del primer registro (columna "No. CONTRATO")
    const numdoc =
      aiuData[0][getKey(aiuData[0], "No CONTRATO")] || "SIN_NUMDOC";

    const tipo_doc = req.body.tipo_doc || "Contrato";

    console.log("Número de contrato detectado:", numdoc);

    for (const row of aiuData) {
      const item = row[getKey(row, "ITEM")];
      const vrIva = parseNumber(row[getKey(row, "VR IVA")]);

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
        row[getKey(row, "ITEM")],
        row[getKey(row, "INSUMO")], // ⚡ nuevo campo INSUMO
        row[getKey(row, "REF")],
        parseNumber(row[getKey(row, "CANT")]),
        row[getKey(row, "UM")],
        parseNumber(row[getKey(row, "ANCHO")]),
        parseNumber(row[getKey(row, "ALTO")]),
        row[getKey(row, "DESCRIPCION")],
        parseNumber(row[getKey(row, "VALOR BASE")]),
        parseNumber(row[getKey(row, "% ADM")]),
        parseNumber(row[getKey(row, "VR ADM")]),
        parseNumber(row[getKey(row, "% IMP")]),
        parseNumber(row[getKey(row, "VR IMP")]),
        parseNumber(row[getKey(row, "% UT")]),
        parseNumber(row[getKey(row, "VR UT")]),
        parseNumber(row[getKey(row, "% IVA")]),
        parseNumber(row[getKey(row, "VR IVA")]),
        parseNumber(row[getKey(row, "VR TOTAL")]),
        tipo_doc,
        numdoc,
      ];

      await ejecutarQuery(
        `CALL sp_insertar_aiu(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }

    fs.unlinkSync(req.file.path); // Eliminar archivo temporal
    res
      .status(200)
      .json({ message: "Archivo procesado y datos insertados correctamente." });
  } catch (error) {
    console.error("Error al procesar archivo Excel:", error);
    res
      .status(500)
      .json({
        error: "Error al procesar archivo Excel",
        detalle: error.message,
      });
  }
};

module.exports = { uploadExcel };
