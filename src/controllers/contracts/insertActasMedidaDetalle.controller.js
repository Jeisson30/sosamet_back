const path = require("path");
const db = require("../../config/db");

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

const toDecimalOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeTipoVinculo = (raw) => {
  const v = String(raw ?? "CONTRATO")
    .trim()
    .toUpperCase();
  return v === "COTIZACION" ? "COTIZACION" : "CONTRATO";
};

/**
 * Inserta ítems de Actas de Medida vía sp_insertar_actas_medida_plano.
 * Body (multipart): consecutivo, numero_contrato (clave contrato O cotización),
 * tipo_vinculo (CONTRATO|COTIZACION), items (JSON),
 * archivos opcionales evidencia_0, evidencia_1, ...
 * usuario_creacion = id del usuario autenticado (JWT).
 */
const insertActasMedidaDetalle = async (req, res) => {
  try {
    const consecutivo = String(req.body?.consecutivo ?? "").trim();
    const numeroContrato = String(req.body?.numero_contrato ?? "").trim();
    const tipoVinculo = normalizeTipoVinculo(req.body?.tipo_vinculo);
    const usuarioCreacion = Number(req.user?.id_usuario);

    if (!consecutivo || !numeroContrato) {
      return res.status(400).json({
        mensaje:
          "consecutivo y numero_contrato (o N° cotización) son obligatorios.",
      });
    }

    if (!Number.isFinite(usuarioCreacion) || usuarioCreacion <= 0) {
      return res.status(401).json({
        mensaje: "No se pudo identificar el usuario de creación.",
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
      return res.status(400).json({ mensaje: "El formato de items es inválido." });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        mensaje: "Debe enviar al menos un ítem de acta de medida.",
      });
    }

    const itemsConCantidad = items.filter((row) => {
      const cant = Number(row?.cantidad);
      return Number.isFinite(cant) && cant > 0;
    });

    if (itemsConCantidad.length === 0) {
      return res.status(400).json({
        mensaje: "Debe enviar al menos un ítem con cantidad mayor a cero.",
      });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    const fileByField = new Map(files.map((f) => [f.fieldname, f]));

    // Validar códigos de insumo contra catálogo cuando vienen en el payload
    const codigos = [
      ...new Set(
        itemsConCantidad
          .map((row) =>
            String(row?.insumo_codigo ?? row?.amd_insumo_codigo ?? "")
              .trim()
              .toUpperCase()
          )
          .filter(Boolean)
      ),
    ];

    if (codigos.length) {
      const placeholders = codigos.map(() => "?").join(",");
      const found = await ejecutarQuery(
        `SELECT UPPER(TRIM(codigo)) AS codigo
           FROM insumo
          WHERE estado = 'ACTIVO'
            AND UPPER(TRIM(codigo)) IN (${placeholders})`,
        codigos
      );
      const foundSet = new Set(
        (Array.isArray(found) ? found : []).map((r) =>
          String(r.codigo ?? "").trim().toUpperCase()
        )
      );
      const missing = codigos.filter((c) => !foundSet.has(c));
      if (missing.length) {
        return res.status(400).json({
          mensaje: `Hay códigos de insumo que no existen en el catálogo: ${missing.join(
            ", "
          )}. Debe registrarlos en Administración → Insumos.`,
          codigos_faltantes: missing,
        });
      }
    }

    // Toda fila medida debe traer insumo válido del catálogo
    for (const row of itemsConCantidad) {
      const code = String(row?.insumo_codigo ?? "").trim().toUpperCase();
      const id = Number(row?.insumo_id);
      if (!code || !Number.isFinite(id) || id <= 0) {
        return res.status(400).json({
          mensaje: `El ítem "${String(
            row?.item ?? ""
          ).trim()}" no tiene un insumo válido del catálogo.`,
        });
      }
    }

    for (let i = 0; i < itemsConCantidad.length; i++) {
      const row = itemsConCantidad[i] || {};
      // Evidencia por ítem deprecada: archivo general del acta (archivo_acta).
      const legacyFile = fileByField.get(`evidencia_${i}`);
      const evidenciaPath = legacyFile
        ? path.posix.join("uploads", legacyFile.filename)
        : null;

      const insumoIdRaw = Number(row.insumo_id ?? row.amd_insumo_id);
      const insumoId =
        Number.isFinite(insumoIdRaw) && insumoIdRaw > 0 ? insumoIdRaw : null;
      const insumoCodigo =
        String(row.insumo_codigo ?? row.amd_insumo_codigo ?? "").trim() || null;

      await ejecutarQuery(
        `CALL sp_insertar_actas_medida_plano(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          consecutivo,
          numeroContrato,
          String(row.item ?? "").trim() || null,
          String(row.detalle ?? "").trim() || null,
          toDecimalOrNull(row.cantidad),
          String(row.um ?? "").trim() || null,
          toDecimalOrNull(row.ancho),
          toDecimalOrNull(row.alto),
          toDecimalOrNull(row.fondo),
          String(row.observaciones ?? "").trim() || null,
          evidenciaPath,
          usuarioCreacion,
          tipoVinculo,
          insumoId,
          insumoCodigo,
        ]
      );
    }

    const archivoActa = fileByField.get("archivo_acta");
    if (archivoActa) {
      const archivoPath = path.posix.join("uploads", archivoActa.filename);
      await ejecutarQuery(
        `CALL sp_insertar_item_documento(?, ?, ?, ?)`,
        ["ACTAS DE MEDIDA", consecutivo, "archivo_acta", archivoPath]
      );
    }

    return res.status(200).json({
      mensaje: "Ítems de actas de medida guardados correctamente.",
      insertados: itemsConCantidad.length,
      tipo_vinculo: tipoVinculo,
    });
  } catch (error) {
    console.error("❌ Error al insertar actas de medida detalle:", error);
    return res.status(500).json({
      mensaje: "Error interno al guardar los ítems del acta de medida.",
      error: error.message,
    });
  }
};

module.exports = { insertActasMedidaDetalle };
