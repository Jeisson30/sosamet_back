const mysql = require("mysql2/promise");

(async () => {
  const c = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "!jeisson",
    database: "sosamet",
    multipleStatements: true,
  });

  const sql = `
DROP PROCEDURE IF EXISTS SP_CONSULTAR_ACTAS_MEDIDA;
CREATE PROCEDURE SP_CONSULTAR_ACTAS_MEDIDA(
    IN pConsecutivo      VARCHAR(30),
    IN pConstructora     VARCHAR(150),
    IN pProyecto         VARCHAR(150),
    IN pContrato         VARCHAR(100),
    IN pFechaDesde       DATE,
    IN pFechaHasta       DATE
)
BEGIN
    SELECT
        A.consecutivo,
        A.constructora,
        A.proyecto,
        A.numero_contrato,
        A.fecha_acta,
        A.fecha_terminacion,
        A.observaciones,
        A.tipo_documento,
        A.descripcion_general,
        A.id_disenador,
        CONCAT(IFNULL(U.nombre,''),' ',IFNULL(U.apellido,'')) AS disenador_encargado,
        A.estado
    FROM (
        SELECT
            d.numerodoc,
            MAX(CASE WHEN d.nombre_campo_doc='consecutivo' THEN d.valor_campo_doc END) consecutivo,
            MAX(CASE WHEN d.nombre_campo_doc='constructora' THEN d.valor_campo_doc END) constructora,
            MAX(CASE WHEN d.nombre_campo_doc='proyecto' THEN d.valor_campo_doc END) proyecto,
            MAX(CASE WHEN d.nombre_campo_doc='numero_contrato' THEN d.valor_campo_doc END) numero_contrato,
            MAX(CASE WHEN d.nombre_campo_doc='observaciones' THEN d.valor_campo_doc END) observaciones,
            MAX(CASE WHEN d.nombre_campo_doc='am_detalle' THEN d.valor_campo_doc END) descripcion_general,
            MAX(CASE WHEN d.nombre_campo_doc='am_tipo_de_doc' THEN d.valor_campo_doc END) tipo_documento,
            MAX(CASE WHEN d.nombre_campo_doc='am_fecha_acta' THEN d.valor_campo_doc END) fecha_acta,
            MAX(CASE WHEN d.nombre_campo_doc='fecha terminación' THEN d.valor_campo_doc END) fecha_terminacion,
            MAX(CASE WHEN d.nombre_campo_doc='am_id_disenador_encargado' THEN d.valor_campo_doc END) id_disenador,
            MAX(CASE WHEN d.nombre_campo_doc='estado' THEN d.valor_campo_doc END) estado
        FROM item_documentos d
        INNER JOIN parametros_documentos p
                ON UPPER(TRIM(d.tipo_doc))=UPPER(TRIM(p.tipo_doc))
               AND UPPER(TRIM(d.nombre_campo_doc))=UPPER(TRIM(p.nombre_campo_doc))
        WHERE UPPER(TRIM(d.tipo_doc))='ACTAS DE MEDIDA'
          AND p.estadocampo=1
        GROUP BY d.numerodoc
    ) A
    LEFT JOIN usuarios U ON U.id_usuario = A.id_disenador
    WHERE
        (pConsecutivo IS NULL OR pConsecutivo='' OR A.consecutivo LIKE CONCAT('%',pConsecutivo,'%'))
    AND (pConstructora IS NULL OR pConstructora='' OR A.constructora LIKE CONCAT('%',pConstructora,'%'))
    AND (pProyecto IS NULL OR pProyecto='' OR A.proyecto LIKE CONCAT('%',pProyecto,'%'))
    AND (pContrato IS NULL OR pContrato='' OR A.numero_contrato LIKE CONCAT('%',pContrato,'%'))
    ORDER BY A.consecutivo DESC;

    SELECT
        D.amd_id,
        D.amd_consecutivo,
        D.amd_numero_contrato,
        D.amd_item,
        D.amd_consecutivo_item,
        D.amd_detalle,
        D.amd_cantidad,
        D.amd_unidad_medida,
        D.amd_ancho,
        D.amd_alto,
        D.amd_observaciones,
        D.amd_evidencia,
        D.amd_evidencia_item,
        D.amd_fecha_enviado,
        D.amd_fecha_aprobado,
        D.amd_estado,
        D.amd_fecha_creacion,
        D.amd_usuario_creacion,
        CONCAT(IFNULL(U.nombre,''),' ',IFNULL(U.apellido,'')) AS usuario_creacion,
        D.amd_fecha_modificacion,
        D.amd_usuario_modificacion
    FROM actas_medida_detalle D
    LEFT JOIN usuarios U ON U.id_usuario=D.amd_usuario_creacion
    WHERE
        (pConsecutivo IS NULL OR pConsecutivo='' OR D.amd_consecutivo LIKE CONCAT('%',pConsecutivo,'%'))
    AND (pContrato IS NULL OR pContrato='' OR D.amd_numero_contrato LIKE CONCAT('%',pContrato,'%'))
    ORDER BY D.amd_consecutivo, D.amd_item;
END
`;

  await c.query(sql);
  console.log("SP_CONSULTAR_ACTAS_MEDIDA actualizado OK");

  const [rows] = await c.query(
    `SELECT amd_id, amd_consecutivo, amd_consecutivo_item, amd_evidencia_item
     FROM actas_medida_detalle
     WHERE amd_consecutivo_item IS NOT NULL
       AND TRIM(amd_consecutivo_item) <> ''
     LIMIT 10`
  );
  console.log("Muestra con plano:", JSON.stringify(rows, null, 2));

  const [cols] = await c.query(
    `SHOW COLUMNS FROM actas_medida_detalle LIKE 'amd_consecutivo_item'`
  );
  console.log("Columna existe:", cols.length > 0);

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
