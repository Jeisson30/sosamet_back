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

    const tipo_doc = req.body.tipo_doc || "Remisión";

    // 🔥 CASO 1: VIENE ARCHIVO
    if (req.file) {

      const workbook = XLSX.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const remisionesData = XLSX.utils.sheet_to_json(sheet);

      if (!remisionesData.length) {
        return res.status(400).json({ error: "El archivo está vacío." });
      }

      for (const row of remisionesData) {
        const item = row[getKey(row, "ITEM")];
        const contrato = row[getKey(row, "NO CONTRATO")];
        const empresa = row[getKey(row, "EMPRESA")];
        const cantidad = row[getKey(row, "CANTIDAD")];
        const um = row[getKey(row, "UM")];
        const detalle = row[getKey(row, "DETALLE")];
        const observaciones = row[getKey(row, "OBSERVACIONES")];

        if (!item || !contrato) continue;

        await ejecutarQuery(
          `CALL sp_insertar_remisiones_plano(?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            contrato,
            empresa || null,
            item,
            cantidad,
            um,
            detalle,
            observaciones,
            tipo_doc,
          ]
        );
      }

      fs.unlinkSync(req.file.path);

      return res.status(200).json({
        message: "Archivo de remisiones procesado correctamente.",
      });
    }
    // CASO 2: VIENEN DATOS MANUALES
    if (req.body.detalle_remision) {

      const detalle = JSON.parse(req.body.detalle_remision);

      const {
        tipo_doc_rem,
        numero_contrato,
        remision_material,
        fecha_remision,
        cliente,
        proyecto,
        despacho,
        transporto,
        empresa_asociada,
        elaboro,
        direccion_empresa
      } = req.body;

      if (!numero_contrato) {
        return res.status(400).json({ error: "El número de contrato es obligatorio." });
      }

      if (!empresa_asociada) {
        return res.status(400).json({ error: "La empresa asociada es obligatoria." });
      }

      // Generar número documento
      const numerodoc = `RM-${Date.now()}`;

      // Insertar encabezado dinámico
      const campos = [
        { nombre: "tipo_doc_rem", valor: tipo_doc_rem },
        { nombre: "numero_contrato", valor: numero_contrato },
        { nombre: "remision_material", valor: remision_material },
        { nombre: "fecha_remision", valor: fecha_remision },
        { nombre: "cliente", valor: cliente },
        { nombre: "proyecto", valor: proyecto },
        { nombre: "despacho", valor: despacho },
        { nombre: "transporto", valor: transporto },
        { nombre: "empresa_asociada", valor: empresa_asociada },
        { nombre: "elaboro", valor: elaboro },
        { nombre: "direccion_empresa", valor: direccion_empresa }
      ];

      for (const campo of campos) {
        await ejecutarQuery(
          `CALL sp_insertar_item_documento(?, ?, ?, ?)`,
          [
            "REMISIONES",
            numerodoc,
            campo.nombre,
            campo.valor ? campo.valor.toString() : ""
          ]
        );
      }

      //Insertar detalle
      for (const row of detalle) {
        await ejecutarQuery(
          `CALL sp_insertar_remisiones_plano(?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            numero_contrato,
            empresa_asociada,
            row.item,
            row.cantidad,
            row.um,
            row.detalle,
            row.observaciones,
            tipo_doc,
          ]
        );
      }

      return res.status(200).json({
        message: "Remisión manual insertada correctamente.",
        numerodoc
      });
    }


    return res.status(400).json({
      error: "No se recibió archivo ni datos manuales.",
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "Error al procesar remisiones",
      detalle: error.message,
    });
  }
};

module.exports = { uploadExcelRemisiones };
