const db = require("../../../config/db");

const insertOrderWork = async (req, res) => {
  const {
    consecutivo,
    tipo_corte,
    empresa_asociada_id,
    encargado_id,
    fecha_entrega,
    observaciones,
    items
  } = req.body;

  if (
    !consecutivo ||
    !tipo_corte ||
    !empresa_asociada_id ||
    !encargado_id ||
    !fecha_entrega ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res.status(400).json({
      message: "Datos incompletos para crear la orden de trabajo."
    });
  }

  try {

    // 🔹 FORMATEAR FECHA A YYYY-MM-DD (compatible con MySQL DATE)
    const fechaFormateada = new Date(fecha_entrega);

    if (isNaN(fechaFormateada.getTime())) {
      return res.status(400).json({
        message: "Formato de fecha inválido."
      });
    }

    const fechaMysql = fechaFormateada.toISOString().split("T")[0];

    // 🔹 Iniciar transacción
    await new Promise((resolve, reject) => {
      db.beginTransaction(err => {
        if (err) return reject(err);
        resolve();
      });
    });

    // 🔹 Ejecutar SP cabecera
    const spResult = await new Promise((resolve, reject) => {
      db.query(
        "CALL sp_insert_order_work(?, ?, ?, ?, ?, ?)",
        [
          consecutivo,
          empresa_asociada_id,
          encargado_id,
          fechaMysql, // ✅ fecha corregida
          observaciones || null,
          tipo_corte
        ],
        (err, results) => {
          if (err) return reject(err);
          resolve(results);
        }
      );
    });

    const id_order_work = spResult[0][0].id_order_work;

    if (!id_order_work) {
      throw new Error("No se pudo generar la orden de trabajo.");
    }

    // 🔹 Insert masivo detalle
    const values = items.map(item => [
      id_order_work,
      item.ref || null,
      item.no_contrato || null,
      item.obra || null,
      item.item || null,
      item.descripcion || null,
      item.cantidad || 0,
      item.um || null,
      item.ancho || 0,
      item.alto || 0,
      item.observaciones || null
    ]);

    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO order_work_detail
        (id_order_work, ref, no_contrato, obra, item,
        descripcion, cantidad, um, ancho, alto, observaciones)
        VALUES ?`,
        [values],
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
    });

    // 🔹 Commit
    await new Promise((resolve, reject) => {
      db.commit(err => {
        if (err) return reject(err);
        resolve();
      });
    });

    res.status(200).json({
      message: "Orden de trabajo creada correctamente.",
      id_order_work
    });

  } catch (error) {
    db.rollback(() => {
      console.error("Error en orden de trabajo:", error);
      res.status(500).json({
        message: "Error interno del servidor.",
        error: error.message
      });
    });
  }
};

module.exports = {
  insertOrderWork,
};