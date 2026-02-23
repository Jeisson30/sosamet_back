const db = require("../../../config/db");

const insertLiquidationCourts = async (req, res) => {
  const {
    consecutivo,
    nombre_corte,
    empresa_asociada_id,
    encargado_id,
    observaciones,
    resumen,
    items
  } = req.body;

  if (
    !consecutivo ||
    !nombre_corte ||
    !empresa_asociada_id ||
    !encargado_id ||
    !Array.isArray(items)
  ) {
    return res.status(400).json({
      mensaje: "Datos incompletos para crear la liquidación."
    });
  }

  try {
    // Convertimos beginTransaction a Promise
    await new Promise((resolve, reject) => {
      db.beginTransaction(err => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Ejecutar SP
    const spResult = await new Promise((resolve, reject) => {
      db.query(
        "CALL sp_insert_liquidacion_corte(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          consecutivo,
          nombre_corte,
          empresa_asociada_id,
          encargado_id,
          observaciones || null,
          resumen?.subtotal || 0,
          resumen?.seguridad_social || 0,
          resumen?.maquinaria_aseo || 0,
          resumen?.casino || 0,
          resumen?.prestamos || 0,
          resumen?.otros || 0,
          resumen?.total || 0
        ],
        (err, results) => {
          if (err) return reject(err);
          resolve(results);
        }
      );
    });

    const id_liquidacion = spResult[0][0].id_liquidacion;

    if (!id_liquidacion) {
      throw new Error("No se pudo generar la liquidación.");
    }

    // Insert masivo plano
    if (items.length > 0) {
      const values = items.map(item => [
        id_liquidacion,
        item.ref || null,
        item.no_orden || null,
        item.no_contrato || null,
        item.obra || null,
        item.item || null,
        item.descripcion || null,
        item.cantidad || 0,
        item.um || null,
        item.ancho || 0,
        item.alto || 0,
        item.observaciones || null,
        item.vr_unitario || 0,
        item.vr_total || 0
      ]);

      await new Promise((resolve, reject) => {
        db.query(
          `INSERT INTO liquidacion_corte_plano
          (id_liquidacion, ref, no_orden, no_contrato, obra, item, descripcion,
          cantidad, um, ancho, alto, observaciones, vr_unitario, vr_total)
          VALUES ?`,
          [values],
          (err, result) => {
            if (err) return reject(err);
            resolve(result);
          }
        );
      });
    }

    // Commit
    await new Promise((resolve, reject) => {
      db.commit(err => {
        if (err) return reject(err);
        resolve();
      });
    });

    res.status(200).json({
      mensaje: "Liquidación creada correctamente.",
      id_liquidacion
    });

  } catch (error) {
    // Rollback
    db.rollback(() => {
      console.error("Error en liquidación:", error);
      res.status(500).json({
        mensaje: "Error interno del servidor.",
        error: error.message
      });
    });
  }
};

module.exports = {
  insertLiquidationCourts,
};