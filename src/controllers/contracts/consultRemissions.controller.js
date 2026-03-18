const db = require('../../config/db');

const consultRemissions = (req, res) => {
  const {
    buscar = null,
    fecha_desde = null,
    fecha_hasta = null,
    empresa_asociada = null,
    constructora = null,
    proyecto = null,
  } = req.query;

  const params = [
    buscar && buscar.trim() ? buscar.trim() : null,
    fecha_desde && fecha_desde.trim() ? fecha_desde.trim() : null,
    fecha_hasta && fecha_hasta.trim() ? fecha_hasta.trim() : null,
    empresa_asociada && String(empresa_asociada).trim()
      ? String(empresa_asociada).trim()
      : null,
    constructora && constructora.trim() ? constructora.trim() : null,
    proyecto && proyecto.trim() ? proyecto.trim() : null,
  ];

  db.query('CALL SP_ConsultarRemisiones(?, ?, ?, ?, ?, ?)', params, (err, results) => {
    if (err) {
      return res.status(500).json({
        error: 'Error al consultar remisiones',
        detalle: err,
      });
    }

    const rows = results && results[0] ? results[0] : [];

    // Enriquecer con numerodoc real desde item_documentos (clave remision_material)
    const remisiones = Array.from(
      new Set(
        rows
          .map((r) => r.remision_material)
          .filter((v) => v !== null && v !== undefined)
      )
    );

    if (!remisiones.length) {
      return res.status(200).json({ data: rows });
    }

    db.query(
      `SELECT numerodoc, valor_campo_doc AS remision_material
         FROM sosamet.item_documentos
        WHERE nombre_campo_doc = 'remision_material'
          AND valor_campo_doc IN (?)`,
      [remisiones],
      (mapErr, mapResults) => {
        if (mapErr) {
          // Si falla el mapeo, devolvemos igual las filas básicas
          return res.status(200).json({ data: rows });
        }

        const map = new Map();
        (mapResults || []).forEach((row) => {
          map.set(row.remision_material, row.numerodoc);
        });

        const enriched = rows.map((r) => ({
          ...r,
          numerodoc: map.get(r.remision_material) || null,
        }));

        return res.status(200).json({ data: enriched });
      }
    );
  });
};

const updateRemission = (req, res) => {
  const {
    numerodoc,
    actualizar_cabecera,
    actualizar_detalle,
    tipo_doc_rem,
    numero_contrato,
    remision_material,
    fecha_remision,
    cliente,
    proyecto,
    despacho,
    transporto,
    empresa_asociada,
    direccion_empresa,
    orden_de_compra,
    item,
    empresa,
    cantidad,
    um,
    detalle,
    observaciones,
  } = req.body || {};

  const ejecutarActualizacion = (docNumber) => {
    const params = [
      docNumber || null,
      actualizar_cabecera ? 1 : 0,
      actualizar_detalle ? 1 : 0,
      tipo_doc_rem || null,
      numero_contrato || null,
      remision_material || null,
      fecha_remision || null,
      cliente || null,
      proyecto || null,
      despacho || null,
      transporto || null,
      empresa_asociada || null,
      direccion_empresa || null,
      orden_de_compra || null,
      item || null,
      empresa || null,
      cantidad != null ? cantidad : null,
      um || null,
      detalle || null,
      observaciones || null,
    ];

    db.query(
      'CALL SP_ActualizarRemision(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params,
      (err) => {
        if (err) {
          return res.status(500).json({
            error: 'Error al actualizar remisión',
            detalle: err,
          });
        }

        return res
          .status(200)
          .json({ mensaje: 'Remisión actualizada correctamente' });
      }
    );
  };

  // El SP espera "numerodoc" interno de item_documentos, no necesariamente el valor de remisión (REM-XXXX).
  // Buscamos primero por remision_material para obtener numerodoc real.
  if (remision_material) {
    db.query(
      `SELECT numerodoc 
         FROM sosamet.item_documentos 
        WHERE valor_campo_doc = ? 
          AND nombre_campo_doc = 'remision_material'
        LIMIT 1`,
      [remision_material],
      (err, results) => {
        if (err) {
          return res.status(500).json({
            error: 'Error al buscar numerodoc de la remisión',
            detalle: err,
          });
        }

        const row = results && results[0];
        const docNumber = row && row.numerodoc ? row.numerodoc : numerodoc || remision_material;
        ejecutarActualizacion(docNumber);
      }
    );
  } else {
    // Sin remision_material, usamos numerodoc tal como viene
    ejecutarActualizacion(numerodoc || null);
  }
};

module.exports = { consultRemissions, updateRemission };

