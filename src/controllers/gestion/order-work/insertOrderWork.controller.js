const db = require("../../../config/db");

const insertOrderWork = async (req, res) => {
  const {
    consecutivo,
    tipo_corte,
    empresa_asociada_id,
    encargado_id,
    fecha_entrega,
    observaciones,
    ot_constructora,
    ot_proyecto,
    ot_tipo_documento,
    ot_contrato,
    ot_autorizo,
    items
  } = req.body;

  if (
    !consecutivo ||
    !tipo_corte ||
    !encargado_id ||
    !fecha_entrega ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res.status(400).json({
      message: "Datos incompletos para crear la orden de trabajo."
    });
  }

  let connection;

  try {
    const fechaFormateada = new Date(fecha_entrega);

    if (isNaN(fechaFormateada.getTime())) {
      return res.status(400).json({
        message: "Formato de fecha inválido."
      });
    }

    const fechaMysql = fechaFormateada.toISOString().split("T")[0];

    connection = await new Promise((resolve, reject) => {
      db.getConnection((err, conn) => {
        if (err) return reject(err);
        resolve(conn);
      });
    });

    await new Promise((resolve, reject) => {
      connection.beginTransaction((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const spResult = await new Promise((resolve, reject) => {
      connection.query(
        "CALL sp_insert_order_work(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          consecutivo,
          empresa_asociada_id || null,
          encargado_id,
          fechaMysql,
          observaciones || null,
          tipo_corte,
          ot_constructora || null,
          ot_proyecto || null,
          ot_tipo_documento || null,
          ot_contrato || null,
          ot_autorizo || null
        ],
        (err, results) => {
          if (err) return reject(err);
          resolve(results);
        }
      );
    });

    const id_order_work = spResult?.[0]?.[0]?.id_order_work;

    if (!id_order_work) {
      throw new Error("No se pudo generar la orden de trabajo.");
    }

    const values = items.map((item) => [
      id_order_work,
      item.ref || null,
      item.item || null,
      item.descripcion || null,
      item.cantidad || 0,
      item.um || null,
      item.ancho || 0,
      item.alto || 0,
      item.observaciones || null
    ]);

    await new Promise((resolve, reject) => {
      connection.query(
        `INSERT INTO order_work_detail
        (id_order_work, ref, item, descripcion, cantidad, um, ancho, alto, observaciones)
        VALUES ?`,
        [values],
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
    });

    await new Promise((resolve, reject) => {
      connection.commit((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    connection.release();
    connection = null;

    return res.status(200).json({
      message: "Orden de trabajo creada correctamente.",
      id_order_work
    });
  } catch (error) {
    console.error("Error en orden de trabajo:", error);

    if (connection) {
      try {
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
      } catch (rollbackErr) {
        console.error("Error en rollback:", rollbackErr);
      } finally {
        connection.release();
      }
    }

    return res.status(500).json({
      message: "Error interno del servidor.",
      error: error.message
    });
  }
};

module.exports = {
  insertOrderWork,
};
