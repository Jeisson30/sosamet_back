const path = require("path");
const db = require("../../config/db");

const ejecutarQuery = (sql, values) => {
  return new Promise((resolve, reject) => {
    db.query(sql, values, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

const toNull = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s : null;
  }
  return v;
};

const toDateOrNull = (v) => {
  const s = toNull(v);
  if (!s) return null;
  const raw = String(s).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/**
 * Finaliza acta de medida (Planos):
 * 1) Actualiza por ítem: amd_consecutivo_item, amd_evidencia_item,
 *    amd_fecha_enviado, amd_fecha_aprobado (opcionales).
 * 2) Llama SP_FINALIZAR_ACTA_MEDIDA(consecutivo, usuario).
 * 3) Alinea estado de cabecera (item_documentos) a 2 si el SP OK.
 *
 * Body multipart:
 *  - consecutivo
 *  - fecha_enviado (YYYY-MM-DD, opcional)
 *  - fecha_aprobado (YYYY-MM-DD, opcional)
 *  - items: JSON [{ amd_id, consecutivo_item?, evidencia_item? }]
 *  - archivos opcionales: evidencia_item_{amd_id}
 */
const finalizarActaMedida = async (req, res) => {
  try {
    const consecutivo = String(req.body?.consecutivo ?? "").trim();
    const usuario = Number(req.user?.id_usuario);

    if (!consecutivo) {
      return res.status(400).json({
        Codigo: 0,
        mensaje: "El consecutivo es obligatorio.",
      });
    }

    if (!Number.isFinite(usuario) || usuario <= 0) {
      return res.status(401).json({
        Codigo: 0,
        mensaje: "No se pudo identificar el usuario.",
      });
    }

    let items = [];
    try {
      items =
        typeof req.body.items === "string"
          ? JSON.parse(req.body.items)
          : Array.isArray(req.body.items)
            ? req.body.items
            : [];
    } catch {
      return res.status(400).json({
        Codigo: 0,
        mensaje: "El formato de items es inválido.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        Codigo: 0,
        mensaje: "Debe enviar al menos un ítem del acta.",
      });
    }

    const fechaEnviado = toDateOrNull(req.body?.fecha_enviado);
    const fechaAprobado = toDateOrNull(req.body?.fecha_aprobado);

    const files = Array.isArray(req.files) ? req.files : [];
    const fileByField = new Map(files.map((f) => [f.fieldname, f]));

    // 1) Actualizar campos de plano por ítem
    for (const row of items) {
      const amdId = Number(row?.amd_id);
      if (!Number.isFinite(amdId) || amdId <= 0) {
        return res.status(400).json({
          Codigo: 0,
          mensaje: "Cada ítem debe incluir un amd_id válido.",
        });
      }

      const file = fileByField.get(`evidencia_item_${amdId}`);
      const evidenciaPath = file
        ? path.posix.join("uploads", file.filename)
        : toNull(row?.evidencia_item);

      const consecutivoItem = toNull(row?.consecutivo_item);

      await ejecutarQuery(
        `UPDATE actas_medida_detalle
            SET amd_consecutivo_item = COALESCE(?, amd_consecutivo_item),
                amd_evidencia_item = COALESCE(?, amd_evidencia_item),
                amd_fecha_enviado = COALESCE(?, amd_fecha_enviado),
                amd_fecha_aprobado = COALESCE(?, amd_fecha_aprobado),
                amd_fecha_modificacion = NOW(),
                amd_usuario_modificacion = ?
          WHERE amd_id = ?
            AND amd_consecutivo = ?`,
        [
          consecutivoItem,
          evidenciaPath,
          fechaEnviado,
          fechaAprobado,
          usuario,
          amdId,
          consecutivo,
        ]
      );
    }

    // 2) Finalizar acta vía SP
    const spResult = await ejecutarQuery(
      "CALL SP_FINALIZAR_ACTA_MEDIDA(?, ?)",
      [consecutivo, usuario]
    );

    const spRow = Array.isArray(spResult?.[0]) ? spResult[0][0] : null;
    const codigo = Number(spRow?.Codigo ?? spRow?.codigo ?? 0);
    const mensaje =
      spRow?.Mensaje ||
      spRow?.mensaje ||
      (codigo === 1
        ? "Acta finalizada correctamente."
        : "No se pudo finalizar el acta.");

    if (codigo !== 1) {
      return res.status(400).json({
        Codigo: codigo,
        mensaje,
      });
    }

    // 3) Alinear estado de cabecera (consulta de diseñador usa item_documentos)
    await ejecutarQuery(
      `UPDATE item_documentos
          SET valor_campo_doc = '2'
        WHERE numerodoc = ?
          AND UPPER(TRIM(tipo_doc)) = 'ACTAS DE MEDIDA'
          AND nombre_campo_doc = 'estado'`,
      [consecutivo]
    );

    return res.status(200).json({
      Codigo: 1,
      mensaje,
      resultado: 1,
    });
  } catch (error) {
    console.error("Error al finalizar acta de medida:", error);
    return res.status(500).json({
      Codigo: 0,
      mensaje: "Ocurrió un error al finalizar el Acta.",
      error: error.message,
    });
  }
};

module.exports = { finalizarActaMedida };
