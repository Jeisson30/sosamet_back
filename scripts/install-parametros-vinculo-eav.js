/**
 * Registra tipo_vinculo y numero_cotizacion en parametros_documentos
 * (estadocampo=0 → no aparecen en el formulario; el SP sí permite insertarlos).
 * Además repara EAV de RM002.
 *
 * Uso: node scripts/install-parametros-vinculo-eav.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const TIPOS = [
  'Remisiones',
  'Actas De Medida',
  'Orden De Compra',
  'ACTAS DE PAGO',
];

const CAMPOS = [
  {
    nombre: 'tipo_vinculo',
    desc: 'Tipo vínculo',
  },
  {
    nombre: 'numero_cotizacion',
    desc: 'N°.Cotización',
  },
];

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  for (const tipo of TIPOS) {
    for (const campo of CAMPOS) {
      const [ex] = await c.query(
        `SELECT COUNT(*) AS n
           FROM parametros_documentos
          WHERE tipo_doc COLLATE utf8mb4_general_ci = ?
            AND nombre_campo_doc COLLATE utf8mb4_general_ci = ?`,
        [tipo, campo.nombre]
      );
      if (Number(ex[0].n) > 0) {
        console.log(`OK ya existe: ${tipo} / ${campo.nombre}`);
        continue;
      }
      await c.query(
        `INSERT INTO parametros_documentos
           (tipo_doc, nombre_campo_doc, desc_campo_doc, estadocampo)
         VALUES (?, ?, ?, '0')`,
        [tipo, campo.nombre, campo.desc]
      );
      console.log(`INSERT: ${tipo} / ${campo.nombre}`);
    }
  }

  // Reparar RM002 vía SP (ahora sí debe insertar)
  const TIPO_INS = 'REMISIONES';
  const DOC = 'RM-1787504989150';

  const upsert = async (nombre, valor) => {
    const [rows] = await c.query(
      `SELECT COUNT(*) AS n FROM item_documentos
        WHERE tipo_doc COLLATE utf8mb4_general_ci = ?
          AND numerodoc = ? AND nombre_campo_doc = ?`,
      [TIPO_INS, DOC, nombre]
    );
    if (Number(rows[0].n) > 0) {
      await c.query(
        `UPDATE item_documentos SET valor_campo_doc = ?
          WHERE tipo_doc COLLATE utf8mb4_general_ci = ?
            AND numerodoc = ? AND nombre_campo_doc = ?`,
        [valor, TIPO_INS, DOC, nombre]
      );
      console.log(`UPDATE EAV ${nombre}=${valor}`);
    } else {
      await c.query(`CALL sp_insertar_item_documento(?, ?, ?, ?)`, [
        TIPO_INS,
        DOC,
        nombre,
        valor,
      ]);
      console.log(`CALL insert EAV ${nombre}=${valor}`);
    }
  };

  await upsert('numero_cotizacion', 'CT-001');
  await upsert('numero_contrato', '10009615');
  await upsert('tipo_vinculo', 'CONTRATO');

  const [check] = await c.query(
    `SELECT nombre_campo_doc, valor_campo_doc
       FROM item_documentos
      WHERE numerodoc = ?
        AND nombre_campo_doc IN (
          'remision_material','numero_contrato','tipo_vinculo','numero_cotizacion'
        )
      ORDER BY nombre_campo_doc`,
    [DOC]
  );
  console.log('\n=== EAV RM002 final ===');
  console.table(check);

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
