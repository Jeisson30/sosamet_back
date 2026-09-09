const db = require('../../config/db');

const requireAdmin = (req, res) => {
  if (!req.user || Number(req.user.id_perfil) !== 1) {
    res.status(403).json({
      error: 'Solo un administrador puede realizar esta acción.',
    });
    return false;
  }
  return true;
};

const resolveNumerodoc = (remision_material, numerodoc, done) => {
  if (remision_material) {
    return db.query(
      `SELECT numerodoc
         FROM sosamet.item_documentos
        WHERE valor_campo_doc = ?
          AND nombre_campo_doc = 'remision_material'
        LIMIT 1`,
      [remision_material],
      (err, results) => {
        if (err) return done(err);
        const row = results && results[0];
        const docNumber =
          row && row.numerodoc ? row.numerodoc : numerodoc || remision_material;
        return done(null, docNumber);
      }
    );
  }
  return done(null, numerodoc || null);
};

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

const upsertCabeceraEav = (docNumber, fields, done) => {
  const entries = Object.entries(fields).filter(
    ([, v]) => v !== undefined && v !== null
  );
  const run = (i) => {
    if (i >= entries.length) return done();
    const [nombre, valor] = entries[i];
    upsertEavCampo(docNumber, nombre, valor, (err) => {
      if (err) return done(err);
      run(i + 1);
    });
  };
  run(0);
};

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
              estado: eav.estado ?? r.estado ?? null,
              elaboro: eav.elaboro ?? r.elaboro ?? null,
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
              AND nombre_campo_doc IN (
                'tipo_doc_rem', 'tipo_contrato', 'estado', 'elaboro'
              )`,
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
    elaboro,
    id,
    item,
    empresa,
    cantidad,
    um,
    detalle,
    observaciones,
  } = req.body || {};

  const ejecutarActualizacion = (docNumber) => {
    const finishOk = () =>
      res.status(200).json({ mensaje: 'Remisión actualizada correctamente' });

    const afterCabecera = (cb) => {
      if (!actualizar_cabecera) return cb();

      const params = [
        docNumber || null,
        1,
        0,
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
        null,
        null,
        null,
        null,
        null,
        null,
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

          // Upsert EAV: crea campos faltantes (UPDATE del SP no inserta).
          upsertCabeceraEav(
            docNumber,
            {
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
              elaboro,
            },
            (eavErr) => {
              if (eavErr) {
                console.error('updateRemission upsert cabecera:', eavErr);
              }
              cb();
            }
          );
        }
      );
    };

    const afterDetalle = (cb) => {
      if (!actualizar_detalle) return cb();

      const itemId = id != null && id !== '' ? Number(id) : null;
      const contrato =
        numero_contrato ||
        null;

      const doInsert = () => {
        const clave =
          contrato ||
          remision_material ||
          docNumber;
        if (!clave || !item) {
          return res.status(400).json({
            error:
              'Para agregar un ítem se requieren item y numero_contrato (o remisión).',
          });
        }
        db.query(
          `CALL sp_insertar_remisiones_plano(?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            clave,
            empresa || null,
            item,
            cantidad != null ? cantidad : null,
            um || null,
            detalle || null,
            observaciones || null,
            'Remisión',
          ],
          (insErr) => {
            if (insErr) {
              return res.status(500).json({
                error: 'Error al insertar ítem de remisión',
                detalle: insErr,
              });
            }
            cb();
          }
        );
      };

      if (Number.isFinite(itemId) && itemId > 0) {
        db.query(
          `UPDATE sosamet.remisiones_plano
              SET empresa = ?,
                  item = COALESCE(?, item),
                  cantidad = ?,
                  um = ?,
                  detalle = ?,
                  observaciones = ?
            WHERE id = ?`,
          [
            empresa || null,
            item || null,
            cantidad != null ? cantidad : null,
            um || null,
            detalle || null,
            observaciones || null,
            itemId,
          ],
          (updErr, result) => {
            if (updErr) {
              return res.status(500).json({
                error: 'Error al actualizar ítem de remisión',
                detalle: updErr,
              });
            }
            if (result && result.affectedRows === 0) {
              return doInsert();
            }
            cb();
          }
        );
        return;
      }

      // Sin id: intentar SP por contrato+item; si no hay contrato en EAV, insertar.
      const params = [
        docNumber || null,
        0,
        1,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
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
              error: 'Error al actualizar detalle de remisión',
              detalle: err,
            });
          }
          // Si no existía fila (SP no inserta), insertamos por si acaso cuando hay item.
          if (!item) return cb();
          db.query(
            `SELECT valor_campo_doc AS contrato
               FROM sosamet.item_documentos
              WHERE numerodoc = ?
                AND nombre_campo_doc = 'numero_contrato'
              LIMIT 1`,
            [docNumber],
            (cErr, cRows) => {
              const c =
                (!cErr && cRows && cRows[0] && cRows[0].contrato) ||
                contrato ||
                null;
              if (!c) return cb();
              db.query(
                `SELECT id FROM sosamet.remisiones_plano
                  WHERE TRIM(contrato) = TRIM(?)
                    AND TRIM(item) = TRIM(?)
                  LIMIT 1`,
                [c, item],
                (fErr, fRows) => {
                  if (!fErr && fRows && fRows.length) return cb();
                  db.query(
                    `CALL sp_insertar_remisiones_plano(?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      c,
                      empresa || null,
                      item,
                      cantidad != null ? cantidad : null,
                      um || null,
                      detalle || null,
                      observaciones || null,
                      'Remisión',
                    ],
                    (insErr) => {
                      if (insErr) {
                        console.error('insert detalle remisión:', insErr);
                      }
                      cb();
                    }
                  );
                }
              );
            }
          );
        }
      );
    };

    afterCabecera(() => {
      afterDetalle(() => finishOk());
    });
  };

  resolveNumerodoc(remision_material, numerodoc, (err, docNumber) => {
    if (err) {
      return res.status(500).json({
        error: 'Error al buscar numerodoc de la remisión',
        detalle: err,
      });
    }
    ejecutarActualizacion(docNumber);
  });
};

const deleteRemissionDetalle = (req, res) => {
  if (!requireAdmin(req, res)) return;

  const id = Number(req.body?.id ?? req.body?.item_id ?? 0);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'id del ítem es obligatorio.' });
  }

  db.query(
    `DELETE FROM sosamet.remisiones_plano WHERE id = ?`,
    [id],
    (err, result) => {
      if (err) {
        return res.status(500).json({
          error: 'Error al eliminar el ítem de la remisión.',
          detalle: err.message || err,
        });
      }
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({
          error: 'No se encontró el ítem a eliminar.',
        });
      }
      return res.status(200).json({
        mensaje: 'Ítem eliminado correctamente.',
      });
    }
  );
};

const anularRemission = (req, res) => {
  if (!requireAdmin(req, res)) return;

  const numerodoc = String(req.body?.numerodoc ?? '').trim();
  const remision_material = String(req.body?.remision_material ?? '').trim();
  if (!numerodoc && !remision_material) {
    return res.status(400).json({
      error: 'numerodoc o remision_material es obligatorio.',
    });
  }

  const usuario = Number(req.user?.id_usuario ?? 0) || 0;

  resolveNumerodoc(remision_material || null, numerodoc || null, (err, doc) => {
    if (err || !doc) {
      return res.status(500).json({
        error: err?.message || 'No se pudo resolver el documento de la remisión.',
      });
    }

    db.query('CALL SP_ANULAR_REMISION(?, ?)', [doc, usuario], (spErr, results) => {
      if (spErr) {
        return res.status(500).json({
          error: spErr.sqlMessage || 'Error al anular la remisión.',
          detalle: spErr.message || spErr,
        });
      }
      const row = Array.isArray(results?.[0]) ? results[0][0] : null;
      return res.status(200).json({
        mensaje: row?.mensaje || `Remisión ${doc} anulada correctamente.`,
        resultado: row?.resultado ?? 1,
      });
    });
  });
};

const deleteRemission = (req, res) => {
  if (!requireAdmin(req, res)) return;

  const numerodoc = String(req.body?.numerodoc ?? '').trim();
  const remision_material = String(req.body?.remision_material ?? '').trim();
  if (!numerodoc && !remision_material) {
    return res.status(400).json({
      error: 'numerodoc o remision_material es obligatorio.',
    });
  }

  resolveNumerodoc(remision_material || null, numerodoc || null, (err, doc) => {
    if (err || !doc) {
      return res.status(500).json({
        error: err?.message || 'No se pudo resolver el documento de la remisión.',
      });
    }

    db.query('CALL SP_ELIMINAR_REMISION(?)', [doc], (spErr, results) => {
      if (spErr) {
        return res.status(500).json({
          error: spErr.sqlMessage || 'Error al eliminar la remisión.',
          detalle: spErr.message || spErr,
        });
      }
      const row = Array.isArray(results?.[0]) ? results[0][0] : null;
      return res.status(200).json({
        mensaje: row?.mensaje || `Remisión ${doc} eliminada correctamente.`,
        resultado: row?.resultado ?? 1,
      });
    });
  });
};

module.exports = {
  consultRemissions,
  updateRemission,
  deleteRemissionDetalle,
  anularRemission,
  deleteRemission,
};
