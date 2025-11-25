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
    return parseFloat(
      value.replace(/[^0-9,-.]+/g, "").replace(",", ".")
    );
  }
  return value || 0;
};

// Normaliza cabeceras para comparar (ignora mayúsculas, espacios, puntos, º)
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

// Función principal para subir archivo IVA
const uploadExcelIVA = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó un archivo." });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetNames = workbook.SheetNames;
    console.log("Hojas encontradas:", sheetNames);

    if (!sheetNames.includes("IVA")) {
      return res
        .status(400)
        .json({ error: "La hoja 'IVA' no fue encontrada en el archivo." });
    }

    const ivaSheet = workbook.Sheets["IVA"];
    const ivaData = XLSX.utils.sheet_to_json(ivaSheet);

    if (!ivaData || ivaData.length === 0) {
      return res.status(400).json({ error: "La hoja 'IVA' está vacía." });
    }

    // Obtener el número de contrato del primer registro
    const numdoc =
      ivaData[0][getKey(ivaData[0], "NO CONTRATO")] || "SIN_NUMDOC";

    const tipo_doc = req.body.tipo_doc || "Contrato";

    console.log("Número de contrato detectado:", numdoc);

    for (const row of ivaData) {
      const item = row[getKey(row, "ITEM")];
      const vrIva = parseNumber(row[getKey(row, "VR IVA")]);

      // Validaciones para omitir filas inválidas o totales
      if (
        !item ||
        (typeof item === "string" && item.toUpperCase().includes("TOTAL")) ||
        isNaN(vrIva)
      ) {
        console.warn("Fila ignorada (inválida o TOTAL):", row);
        continue;
      }

      const empresa = row[getKey(row, "EMPRESA")];

      const values = [
        row[getKey(row, "ITEM")],
        empresa,
        row[getKey(row, "INSUMO")],
        row[getKey(row, "REF")],
        parseNumber(row[getKey(row, "CANT")]),
        row[getKey(row, "UM")],
        parseNumber(row[getKey(row, "ANCHO")]),
        parseNumber(row[getKey(row, "ALTO")]),
        row[getKey(row, "DESCRIPCION")],
        parseNumber(row[getKey(row, "VALOR BASE")]),
        parseNumber(row[getKey(row, "% IVA")]),
        parseNumber(row[getKey(row, "VR IVA")]),
        parseNumber(row[getKey(row, "VR TOTAL")]),
        tipo_doc,
        numdoc,
      ];

      await ejecutarQuery(
        `CALL sp_insertar_iva_pleno(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }

    fs.unlinkSync(req.file.path); // Eliminar archivo temporal
    res
      .status(200)
      .json({ message: "Archivo IVA procesado y datos insertados correctamente." });
  } catch (error) {
    console.error("Error al procesar archivo IVA:", error);
    res.status(500).json({
      error: "Error al procesar archivo IVA",
      detalle: error.message,
    });
  }
};

module.exports = { uploadExcelIVA };
