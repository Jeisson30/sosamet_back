const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const db = require("../../config/db");

// Ejecutar query con promesas
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

// Sanitizar y convertir valores numéricos
const parseNumber = (value) => {
  if (typeof value === "string") {
    return parseFloat(value.replace(/[^0-9.-]+/g, "").replace(",", "."));
  }
  return value || 0;
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

    // Verifica que exista una hoja llamada "IVA"
    if (!sheetNames.includes("IVA")) {
      return res.status(400).json({ error: "La hoja 'IVA' no fue encontrada en el archivo." });
    }

    const ivaSheet = workbook.Sheets["IVA"];
    const ivaData = XLSX.utils.sheet_to_json(ivaSheet);

    if (!ivaData || ivaData.length === 0) {
      return res.status(400).json({ error: "La hoja 'IVA' está vacía." });
    }

    // Detecta la clave de la columna REF
    const refKey = Object.keys(ivaData[0]).find(key => key.trim().toUpperCase() === "REF");
    if (!refKey) {
      return res.status(400).json({ error: "No se encontró la columna 'REF' en la hoja 'IVA'." });
    }

    const numdoc = ivaData[0][refKey] || "SIN_NUMDOC";
    const tipo_doc = req.body.tipo_doc || "Contrato";

    console.log("Clave REF encontrada:", refKey);
    console.log("Valor numdoc (desde columna REF):", numdoc);

    for (const row of ivaData) {
      const getKey = (target) =>
        Object.keys(row).find((key) => key.trim().toUpperCase() === target.toUpperCase());

      const item = row[getKey("ITEM")];
      const vrIva = parseNumber(row[getKey("VR. IVA")]);

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
        parseNumber(row[getKey("% IVA")]),
        parseNumber(row[getKey("VR. IVA")]),
        parseNumber(row[getKey("VR.  TOTAL")]),
        tipo_doc,
        numdoc
      ];

      await ejecutarQuery(
        `CALL sp_insertar_iva_pleno(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }

    fs.unlinkSync(req.file.path); // Elimina archivo temporal
    res.status(200).json({ message: "Archivo IVA procesado correctamente." });

  } catch (error) {
    console.error("Error al procesar archivo IVA:", error);
    res.status(500).json({ error: "Error al procesar archivo IVA", detalle: error.message });
  }
};

module.exports = { uploadExcelIVA };
