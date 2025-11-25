const XLSX = require("xlsx");
const fs = require("fs");
const db = require("../../config/db");

// Ejecuta query con promesa
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

// Normaliza texto para comparar sin importar mayúsculas, espacios o signos
const normalize = (str) =>
  str
    ? str.toString().trim().toUpperCase().replace(/\s+/g, " ").replace(/[.\u00B0]/g, "")
    : "";

// Encuentra la clave real de una columna (según cabecera)
const getKey = (row, target) => {
  const targetNorm = normalize(target);
  return Object.keys(row).find((key) => normalize(key) === targetNorm);
};

// ✅ Controlador principal
const uploadExcelActasPago = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó un archivo." });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const actasData = XLSX.utils.sheet_to_json(sheet);

    if (!actasData || actasData.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "El archivo está vacío." });
    }

    // ✅ Extraer los encabezados del archivo subido
    const headers = Object.keys(actasData[0]).map((h) => normalize(h));

    // ✅ Encabezados esperados
    const expectedHeaders = [
      "REF",
      "EMPRESA",
      "NO CONTRATO",
      "ITEM",
      "CANT",
      "UM",
      "DESCRIPCION",
      "VALOR BASE",
      "VR TOTAL",
    ].map(normalize);

    // ✅ Validar que los encabezados esperados estén presentes
    const missingHeaders = expectedHeaders.filter(
      (header) => !headers.includes(header)
    );

    if (missingHeaders.length > 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: "El archivo no corresponde al formato de Actas de Pago.",
        detalle: `Faltan las siguientes columnas: ${missingHeaders.join(", ")}`,
      });
    }

    const tipo_doc = req.body.tipo_doc || "Acta de Pago";

    for (const row of actasData) {
      const ref = row[getKey(row, "REF")];
      const empresa = row[getKey(row, "EMPRESA")];
      const numero_contrato = row[getKey(row, "NO CONTRATO")];
      const item = row[getKey(row, "ITEM")];
      const cant = row[getKey(row, "CANT")];
      const um = row[getKey(row, "UM")];
      const descripcion = row[getKey(row, "DESCRIPCION")];
      const valor_base = row[getKey(row, "VALOR BASE")];
      const valor_total = row[getKey(row, "VR TOTAL")];

      if (!numero_contrato || !item) {
        console.warn("⚠️ Fila ignorada por datos incompletos:", row);
        continue;
      }

      const values = [
        ref || null,
        empresa || null,
        numero_contrato,
        item,
        cant || null,
        um || null,
        descripcion || null,
        valor_base || 0,
        valor_total || 0,
        tipo_doc,
      ];

      await ejecutarQuery(
        `CALL sp_insertar_actas_pago_plano(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
    }

    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: "✅ Archivo de Actas de Pago procesado e insertado correctamente.",
    });
  } catch (error) {
    console.error("❌ Error al procesar archivo de Actas de Pago:", error);
    res.status(500).json({
      error: "Error al procesar archivo de Actas de Pago",
      detalle: error.message,
    });
  }
};

module.exports = { uploadExcelActasPago };
