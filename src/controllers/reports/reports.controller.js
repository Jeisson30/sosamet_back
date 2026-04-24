const XLSX = require('xlsx');
// const db = require('../../config/db');

/**
 * Estructura alineada con CONSULTAS GENERAL (PDF) — producción por contrato.
 * TODO: CALL sp_informe_produccion_por_contrato(...) cuando el SP exista.
 */
function buildProductionByContractDataset(query) {
  const {
    numero_contrato: rawNum,
    documento: rawDoc,
    tipo_corte: rawTipoCorte,
  } = query;

  const columns = [
    { field: 'numero_contrato', header: 'N° contrato' },
    { field: 'item', header: 'Ítem' },
    { field: 'descripcion', header: 'Descripción' },
    { field: 'um', header: 'UM' },
    { field: 'contratado', header: 'Contratado (contrato)' },
    { field: 'fabricado', header: 'Fabricado (remisiones)' },
    { field: 'entregado', header: 'Entregado (liq. corte)' },
    { field: 'tipo_corte', header: 'Tipo corte' },
    { field: 'adicionales', header: 'Adicionales' },
    { field: 'notas', header: 'Notas' },
  ];

  const meta = {
    reporte: 'Producción por contrato',
    numero_contrato: rawNum && String(rawNum).trim() !== '' ? String(rawNum).trim() : null,
    documento: rawDoc && String(rawDoc).trim() !== '' ? String(rawDoc) : 'Todos',
    tipo_corte: rawTipoCorte && String(rawTipoCorte).trim() !== '' ? String(rawTipoCorte) : 'Todos',
    nota: 'Vista según documento de consultas. Conectar SP para datos reales.',
  };

  const rows = [];
  // Sin filas de ejemplo: el front muestra encabezados; el SP rellenará.

  return { columns, rows, meta };
}

const getProductionByContractPreview = (req, res) => {
  try {
    const { columns, rows, meta } = buildProductionByContractDataset(req.query);
    return res.status(200).json({
      code: 1,
      message: 'Vista previa. Estructura fija; datos vía SP.',
      data: { columns, rows, meta },
    });
  } catch (err) {
    return res.status(500).json({
      code: 0,
      message: 'Error al generar la vista previa del informe.',
      error: err?.message,
    });
  }
};

const exportProductionByContract = (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (format === 'pdf') {
    return res.status(501).json({
      code: 0,
      message: 'Exportación a PDF no implementada aún. Use Excel.',
    });
  }
  if (format !== 'xlsx') {
    return res.status(400).json({ code: 0, message: 'Formato no soportado.' });
  }

  try {
    const { columns, rows, meta } = buildProductionByContractDataset(req.query);
    const headers = columns.map((c) => c.header);
    const aoa = [headers];
    rows.forEach((row) => {
      aoa.push(columns.map((c) => row[c.field] ?? ''));
    });
    aoa.push([]);
    aoa.push([`Resumen: ${JSON.stringify(meta)}`]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Producción x contrato');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Disposition',
      'attachment; filename=informe-produccion-por-contrato.xlsx'
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).json({
      code: 0,
      message: 'Error al generar el archivo Excel.',
      error: err?.message,
    });
  }
};

module.exports = {
  getProductionByContractPreview,
  exportProductionByContract,
};
