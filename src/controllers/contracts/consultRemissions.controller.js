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

        const numerodocs = Array.from(
          new Set(
            [...map.values()].filter((v) => v !== null && v !== undefined)
          )
        );

        const finish = (eavMap = new Map()) => {
          const enriched = rows.map((r) => {
            const numerodoc = map.get(r.remision_material) || null;
            const eav = numerodoc ? eavMap.get(numerodoc) || {} : {};
            return {
              ...r,
              numerodoc,
              tipo_doc_rem:
                eav.tipo_doc_rem != null && eav.tipo_doc_rem !== ''
                  ? eav.tipo_doc_rem
                  : r.tipo_doc_rem ?? null,
              tipo_contrato: eav.tipo_contrato ?? r.tipo_contrato ?? null,
            };
          });
          return res.status(200).json({ data: enriched });
        };

        if (!numerodocs.length) {
          return finish();
        }

        db.query(
          `SELECT numerodoc, nombre_campo_doc, valor_campo_doc
             FROM sosamet.item_documentos
            WHERE numerodoc IN (?)
              AND nombre_campo_doc IN ('tipo_doc_rem', 'tipo_contrato')`,
          [numerodocs],
          (eavErr, eavRows) => {
            if (eavErr) {
              return finish();
            }
            const eavMap = new Map();
            (eavRows || []).forEach((row) => {
              const cur = eavMap.get(row.numerodoc) || {};
              cur[row.nombre_campo_doc] = row.valor_campo_doc;
              eavMap.set(row.numerodoc, cur);
            });
            return finish(eavMap);
          }
        );
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
    tipo_contrato,
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

  const upsertEavCampo = (docNumber, nombre, valor, done) => {
    if (!docNumber || valor === undefined || valor === null) {
      return done();
    }
    const v = String(valor).trim();
    db.query(
      `SELECT id FROM sosamet.item_documentos
        WHERE numerodoc = ?
          AND nombre_campo_doc = ?
        LIMIT 1`,
      [docNumber, nombre],
      (selErr, selRows) => {
        if (selErr) return done(selErr);
        if (selRows && selRows.length) {
          db.query(
            `UPDATE sosamet.item_documentos
                SET valor_campo_doc = ?
              WHERE numerodoc = ?
                AND nombre_campo_doc = ?`,
            [v, docNumber, nombre],
            done
          );
        } else {
          db.query(
            `CALL sp_insertar_item_documento(?, ?, ?, ?)`,
            ['REMISIONES', docNumber, nombre, v],
            done
          );
        }
      }
    );
  };

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

        // tipo_contrato (Contrato/Cotizacion/…) no está en el SP; se persiste en EAV.
        upsertEavCampo(docNumber, 'tipo_contrato', tipo_contrato, (eavErr) => {
          if (eavErr) {
            console.error('updateRemission tipo_contrato:', eavErr);
          }
          return res
            .status(200)
            .json({ mensaje: 'Remisión actualizada correctamente' });
        });
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

