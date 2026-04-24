const XLSX = require("xlsx");
const fs = require("fs");
const db = require("../../config/db");
const { notifyDocumentCreated } = require('../../utils/documentCreatedEmail');

// ===============================
// HELPERS PROFESIONALES
// ===============================

// Ejecutar query con promesas (igual que remisiones)
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

// Convierte a número seguro (evita NaN, limpia comas)
const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;

  const clean = value.toString().replace(/,/g, "").trim();
  const n = Number(clean);

  return isNaN(n) ? 0 : n;
};

// Convierte porcentajes correctamente
const toPercentage = (value) => {
  if (value === null || value === undefined || value === "") return 0;

  let clean = value.toString()
    .replace("%", "")
    .replace(/,/g, "")
    .trim();

  let n = Number(clean);

  if (isNaN(n)) return 0;

  // Si Excel trae 0.10 como 10%
  if (n > 0 && n < 1) {
    n = n * 100;
  }

  // Seguridad financiera
  if (n < 0) n = 0;
  if (n > 100) n = 100;

  return Number(n.toFixed(2));
};

// Convierte vacío a null (para textos)
const toNull = (value) => {
  if (!value || value.toString().trim() === "") return null;
  return value.toString().trim();
};

// ===============================
// CONTROLADOR PRINCIPAL
// ===============================

const uploadExcelActasPago = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó archivo." });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    const dataRows = rawData
      .slice(2)
      .filter(r => r[2] && r[2] !== "ITEM");
    
    if (!dataRows.length) {
      return res.status(400).json({ error: "El archivo no contiene datos válidos." });
    }

    const first = dataRows[0];

    const ref = toNull(first[0]);
    const numero_contrato = toNull(first[1]);
    const tipo_doc = "Acta de Pago";

    if (!numero_contrato) {
      return res.status(400).json({
        error: "El número de contrato es obligatorio."
      });
    }

    let totalDocumento = 0;
    
    // Insertar maestro
    const maestroResult = await ejecutarQuery(
      `INSERT INTO actas_pago_plano 
       (ref, numero_contrato, tipo_doc, vr_total_documento, total_a_pagar)
       VALUES (?, ?, ?, 0, 0)`,
      [ref, numero_contrato, tipo_doc]
    );

    const actaId = maestroResult.insertId;

    // Insertar detalle
    for (const row of dataRows) {
      console.log("Fila cruda:", row);
      const item = toNull(row[2]);
      if (!item) continue;

      const totalFila = toNumber(row[30]);
      totalDocumento += totalFila;

      await ejecutarQuery(
        `INSERT INTO actas_pago_plano_detalle (
          acta_pago_id,
          item,
          cant,
          um,
          descripcion,
          valor_base,
          pct_adm, vr_adm,
          pct_imp, vr_imp,
          pct_ut, vr_ut,
          pct_iva_aiu, vr_iva_aiu,
          pct_iva_pleno, vr_iva_pleno,
          pct_rte_fte, vr_rte_fte,
          pct_rte_ica, vr_rte_ica,
          pct_rte_iva, vr_rte_iva,
          pct_rte_garantia, vr_rte_garantia,
          pct_fic, vr_fic,
          otros,
          total_fila
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          actaId,
          item,
          toNumber(row[3]),
          toNull(row[4]),
          toNull(row[5]),
          toNumber(row[6]),

          // PORCENTAJES CON PROTECCIÓN
          toPercentage(row[7]),  toNumber(row[8]),
          toPercentage(row[9]),  toNumber(row[10]),
          toPercentage(row[11]), toNumber(row[12]),
          toPercentage(row[13]), toNumber(row[14]),
          toPercentage(row[15]), toNumber(row[16]),
          toPercentage(row[17]), toNumber(row[18]),
          toPercentage(row[19]), toNumber(row[20]),
          toPercentage(row[21]), toNumber(row[22]),
          toPercentage(row[23]), toNumber(row[24]),
          toPercentage(row[25]), toNumber(row[26]),

          toNumber(row[29]),
          totalFila
        ]
      );
    }

    // Actualizar maestro con total real
    await ejecutarQuery(
      `UPDATE actas_pago_plano
       SET vr_total_documento = ?, total_a_pagar = ?
       WHERE id = ?`,
      [totalDocumento, totalDocumento, actaId]
    );

    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: "Acta cargada correctamente.",
      actaId,
      totalDocumento
    });

    // Best-effort: correo informativo (carga masiva)
    void notifyDocumentCreated({
      reqUser: req.user,
      tipo_doc,
      numerodoc: '',
    });
  } catch (error) {
    console.error("Error:", error);

    res.status(500).json({
      error: "Error procesando archivo",
      detalle: error.message
    });
  }
};

module.exports = { uploadExcelActasPago };