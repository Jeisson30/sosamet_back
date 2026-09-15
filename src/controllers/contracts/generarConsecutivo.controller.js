const db = require("../../config/db");

/** Pisos alineados a producción (remisiones). */
const REMISION_FLOOR = {
  SM: 19442,
  HS: 2333,
};

/** Actas de medida producción: último usado 026-183 → siguiente a asignar 026-184. */
const ACTA_PREFIX = "026";
const ACTA_FLOOR = 184;

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

/**
 * Genera consecutivo vía SP_GENERAR_CONSECUTIVO(tipo).
 * Ejemplo tipo: ACTA_MEDIDA
 * Respuesta SP: exitoso, consecutivo, numero
 */
const generarConsecutivo = async (req, res) => {
  try {
    const tipo = String(req.body?.tipo ?? "").trim().toUpperCase();

    if (!tipo) {
      return res.status(400).json({
        mensaje: "El tipo de documento es obligatorio (ej. ACTA_MEDIDA).",
      });
    }

    const results = await ejecutarQuery("CALL SP_GENERAR_CONSECUTIVO(?)", [
      tipo,
    ]);
    const row = Array.isArray(results?.[0]) ? results[0][0] : results?.[0];

    if (!row) {
      return res.status(500).json({
        mensaje: "El SP no devolvió datos de consecutivo.",
      });
    }

    const exitoso = Number(
      row.exitoso ?? row.Exitoso ?? row.EXITOSO ?? row.exito ?? 0
    );
    const consecutivo = String(
      row.consecutivo ?? row.Consecutivo ?? row.CONSECUTIVO ?? ""
    ).trim();
    const numero = Number(
      row.numero ?? row.Numero ?? row.NUMERO ?? row.numero_consecutivo ?? 0
    );

    if (exitoso !== 1 || !consecutivo) {
      return res.status(400).json({
        mensaje: "No se pudo generar el consecutivo.",
        exitoso,
        consecutivo: consecutivo || null,
        numero: Number.isFinite(numero) ? numero : null,
      });
    }

    return res.status(200).json({
      mensaje: "Consecutivo generado correctamente.",
      exitoso: 1,
      consecutivo,
      numero: Number.isFinite(numero) ? numero : null,
    });
  } catch (error) {
    console.error("❌ Error al generar consecutivo:", error);
    return res.status(500).json({
      mensaje: "Error interno al generar el consecutivo.",
      error: error.message,
    });
  }
};

const extractDigits = (raw) => {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
};

/**
 * Peek del siguiente consecutivo (NO incrementa contador).
 * Query/body:
 *  - tipo: ACTAS_DE_MEDIDA | REMISIONES
 *  - empresa_asociada: 1 (SM) | 2 (HS) — obligatorio para remisiones
 */
const siguienteConsecutivo = async (req, res) => {
  try {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const tipoRaw = String(src.tipo ?? "").trim().toUpperCase();
    const tipo = tipoRaw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");

    if (tipo === "ACTAS_DE_MEDIDA" || tipo === "ACTA_MEDIDA") {
      const rows = await ejecutarQuery(
        `SELECT TRIM(numerodoc) AS numerodoc,
                MAX(CASE WHEN nombre_campo_doc = 'consecutivo'
                         THEN TRIM(valor_campo_doc) END) AS consecutivo
           FROM item_documentos
          WHERE UPPER(TRIM(tipo_doc)) = 'ACTAS DE MEDIDA'
          GROUP BY numerodoc`
      );
      const list = Array.isArray(rows) ? rows : [];
      let maxNum = 0;
      const re = new RegExp(`^${ACTA_PREFIX}-(\\d+)$`, "i");
      for (const r of list) {
        const cand = String(r.consecutivo || r.numerodoc || "").trim();
        const m = cand.match(re);
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
      }
      const next = Math.max(maxNum, ACTA_FLOOR - 1) + 1;
      const consecutivo = `${ACTA_PREFIX}-${next}`;
      return res.status(200).json({
        mensaje: "Siguiente consecutivo de acta calculado.",
        tipo: "ACTAS_DE_MEDIDA",
        consecutivo,
        numero: next,
        prefijo: `${ACTA_PREFIX}-`,
        piso: ACTA_FLOOR,
      });
    }

    if (tipo === "REMISIONES" || tipo === "REMISION") {
      const empresa = String(src.empresa_asociada ?? src.empresa ?? "").trim();
      if (empresa !== "1" && empresa !== "2") {
        return res.status(400).json({
          mensaje:
            "Para remisiones debe indicar empresa_asociada (1=SM, 2=HS).",
        });
      }
      const prefijo = empresa === "2" ? "HS" : "SM";
      const floor = REMISION_FLOOR[prefijo];
      // Dígitos del piso (+1 margen de crecimiento). Evita basura tipo SM192304 / HS21031.
      const maxDigits = String(floor).length + 1;
      // Techo duro: no aceptar números > 2× piso (datos erróneos / pruebas).
      const maxReasonable = floor * 2;

      const rows = await ejecutarQuery(
        `SELECT
            MAX(CASE WHEN nombre_campo_doc = 'empresa_asociada'
                     THEN TRIM(valor_campo_doc) END) AS empresa_asociada,
            MAX(CASE WHEN nombre_campo_doc = 'remision_material'
                     THEN TRIM(valor_campo_doc) END) AS remision_material
           FROM item_documentos
          WHERE UPPER(TRIM(tipo_doc)) = 'REMISIONES'
          GROUP BY numerodoc`
      );
      const list = Array.isArray(rows) ? rows : [];
      let maxNum = 0;
      for (const r of list) {
        const emp = String(r.empresa_asociada ?? "").trim();
        const raw = String(r.remision_material ?? "").trim().toUpperCase();
        if (!raw) continue;

        // Solo misma empresa + formato estricto PREFIJO + dígitos (ej. SM19441, HS2332)
        if (emp !== empresa) continue;
        if (!raw.startsWith(prefijo)) continue;

        const numPart = raw.slice(prefijo.length);
        if (!/^\d+$/.test(numPart)) continue;
        if (numPart.length > maxDigits) continue;

        const n = Number(numPart);
        if (!Number.isFinite(n) || n <= 0) continue;
        if (n > maxReasonable) continue;

        if (n > maxNum) maxNum = n;
      }

      const next = Math.max(maxNum, floor - 1) + 1;
      const consecutivo = `${prefijo}${next}`;
      return res.status(200).json({
        mensaje: "Siguiente consecutivo de remisión calculado.",
        tipo: "REMISIONES",
        empresa_asociada: empresa,
        prefijo,
        consecutivo,
        numero: next,
        piso: floor,
      });
    }

    return res.status(400).json({
      mensaje: "tipo no soportado. Use ACTAS_DE_MEDIDA o REMISIONES.",
    });
  } catch (error) {
    console.error("❌ Error al calcular siguiente consecutivo:", error);
    return res.status(500).json({
      mensaje: "Error interno al calcular el siguiente consecutivo.",
      error: error.message,
    });
  }
};

module.exports = { generarConsecutivo, siguienteConsecutivo };
