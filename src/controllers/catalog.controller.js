const db = require('../config/db');

const getConstructoras = (req, res) => {
  db.query(
    `SELECT id_constructora AS id,
            nombre,
            nit,
            estado
       FROM sosamet.constructoras
      WHERE estado = 'ACTIVO'
      ORDER BY nombre`,
    (err, results) => {
      if (err) {
        return res.status(500).json({
          error: 'Error al consultar constructoras',
          detalle: err,
        });
      }
      return res.status(200).json(results || []);
    }
  );
};

const getProyectosByConstructora = (req, res) => {
  const { idConstructora } = req.params;

  db.query(
    `SELECT id_proyecto AS id,
            nombre,
            id_constructora AS idConstructora,
            estado
       FROM sosamet.proyectos_constructoras
      WHERE estado = 'ACTIVO'
        AND id_constructora = ?
      ORDER BY nombre`,
    [idConstructora],
    (err, results) => {
      if (err) {
        return res.status(500).json({
          error: 'Error al consultar proyectos',
          detalle: err,
        });
      }
      return res.status(200).json(results || []);
    }
  );
};

/** Catálogo activo de insumos para selects (actas, etc.). */
const getInsumosActivos = (req, res) => {
  const sqlCategorias = `
    SELECT id_categoria, nombre, prefijo
      FROM insumo_categoria
     WHERE estado = 'ACTIVO'
     ORDER BY nombre`;

  const sqlInsumos = `
    SELECT i.id_insumo, i.id_categoria, i.codigo, i.nombre, c.prefijo
      FROM insumo i
      INNER JOIN insumo_categoria c ON c.id_categoria = i.id_categoria
     WHERE i.estado = 'ACTIVO'
       AND c.estado = 'ACTIVO'
     ORDER BY c.prefijo, i.codigo`;

  db.query(sqlCategorias, (errCat, categorias) => {
    if (errCat) {
      return res.status(500).json({
        error: 'Error al consultar categorías de insumos',
        detalle: errCat.message,
      });
    }

    db.query(sqlInsumos, (errIns, insumos) => {
      if (errIns) {
        return res.status(500).json({
          error: 'Error al consultar insumos',
          detalle: errIns.message,
        });
      }

      return res.status(200).json({
        categorias: categorias || [],
        insumos: insumos || [],
      });
    });
  });
};

module.exports = {
  getConstructoras,
  getProyectosByConstructora,
  getInsumosActivos,
};

