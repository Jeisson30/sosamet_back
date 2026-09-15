const { runInTransaction } = require("../../../utils/dbTransaction");

const insertLiquidationCourts = async (req, res) => {
  const {
    consecutivo,
    nombre_corte,
    tipo_corte,
    empresa_asociada_id,
    encargado_id,
    observaciones,
    resumen,
    items,
  } = req.body;

  const toNum = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  if (
    !consecutivo ||
    !nombre_corte ||
    !tipo_corte ||
    !empresa_asociada_id ||
    !encargado_id ||
    !Array.isArray(items)
  ) {
    return res.status(400).json({
      mensaje: "Datos incompletos para crear la liquidación.",
    });
  }

  try {
    const id_liquidacion = await runInTransaction(async (queryTx) => {
      const spResult = await queryTx(
        "CALL sp_insert_liquidacion_corte(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          String(consecutivo).trim(),
          nombre_corte,
          empresa_asociada_id,
          encargado_id,
          observaciones || null,
          tipo_corte,
          toNum(resumen?.subtotal),
          toNum(resumen?.seguridad_social),
          toNum(resumen?.maquinaria_aseo),
          toNum(resumen?.casino),
          toNum(resumen?.retegarantia),
          toNum(resumen?.prestamos),
          toNum(resumen?.otros),
          toNum(resumen?.total),
        ]
      );

      const id = spResult?.[0]?.[0]?.id_liquidacion;
      if (!id) {
        throw new Error("No se pudo generar la liquidación.");
      }

      if (items.length > 0) {
        const values = items.map((item) => [
          id,
          item.ref || null,
          item.insumo || null,
          item.no_orden || null,
          item.no_contrato || null,
          String(item.tipo_vinculo || "").toUpperCase() === "COTIZACION"
            ? "COTIZACION"
            : "CONTRATO",
          item.obra || item.proyecto || null,
          item.item || null,
          item.tipo_actividad || null,
          item.descripcion || item.detalle || null,
          item.ubicacion || null,
          item.cantidad || 0,
          item.um || null,
          item.ancho || 0,
          item.alto || 0,
          item.fondo ?? null,
          item.observaciones || null,
          item.vr_unitario || 0,
          item.vr_total || 0,
        ]);

        await queryTx(
          `INSERT INTO liquidacion_corte_plano
          (id_liquidacion, ref, insumo, no_orden, no_contrato, tipo_vinculo, obra, item,
           tipo_actividad, descripcion, ubicacion, cantidad, um, ancho, alto, fondo,
           observaciones, vr_unitario, vr_total)
          VALUES ?`,
          [values]
        );
      }

      return id;
    });

    return res.status(200).json({
      mensaje: "Liquidación creada correctamente.",
      id_liquidacion,
    });
  } catch (error) {
    console.error("Error en liquidación:", error);
    return res.status(500).json({
      mensaje: "Error interno del servidor.",
      error: error.sqlMessage || error.message,
    });
  }
};

module.exports = {
  insertLiquidationCourts,
};
