/**
 * Permisos módulo contratos / valores (alineado al Excel).
 */

const PERFIL_ID = {
  ADMINISTRADOR: 1,
  SUPERVISOR_PROYECTOS: 2,
  AUXILIAR: 3,
  RESIDENTE_OBRA: 4,
  DELINEANTE: 5,
  CONTABILIDAD: 10,
};

const PERFIL_NOMBRE = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  AUXILIAR: 'AUXILIAR',
  SUPERVISOR_PROYECTOS: 'SUPERVISOR DE PROYECTOS',
  ALMACENISTA: 'ALMACENISTA',
  CONTABILIDAD: 'CONTABILIDAD',
  COORD_COMPRAS: 'COORDINADOR DE COMPRAS',
  OBRA: 'OBRA',
  RESIDENTE_OBRA: 'RESIDENTE DE OBRA',
  DELINEANTE: 'DELINEANTE DE ARQUITECTURA',
  COORD_PRODUCCION: 'COORDINADOR DE PRODUCCION',
};

const EDITORES_CONTRATO = new Set([
  PERFIL_NOMBRE.ADMINISTRADOR,
  PERFIL_NOMBRE.AUXILIAR,
  PERFIL_NOMBRE.SUPERVISOR_PROYECTOS,
]);

const EDITORES_ACTAS_PAGO = new Set([
  PERFIL_NOMBRE.ADMINISTRADOR,
  PERFIL_NOMBRE.AUXILIAR,
  PERFIL_NOMBRE.SUPERVISOR_PROYECTOS,
  PERFIL_NOMBRE.CONTABILIDAD,
]);

/** Claves / patrones de campos monetarios a ocultar en respuestas de lectura. */
const MONETARY_KEY_RE =
  /^(valor_|vr_|.*valor.*|saldo_contrato|facturado|valor_adicional|valor_unitario|valor_base|valor_anticipo|valor_r_garantia|valor_polizas)/i;

function normNombre(nombre) {
  return String(nombre || '').trim().toUpperCase();
}

/**
 * Valores Contrato / Otro Sí: Admin, Supervisor de Proyectos y Auxiliar.
 */
function puedeVerValoresContrato(user) {
  const id = Number(user?.id_perfil);
  if (
    id === PERFIL_ID.ADMINISTRADOR ||
    id === PERFIL_ID.SUPERVISOR_PROYECTOS ||
    id === PERFIL_ID.AUXILIAR
  ) {
    return true;
  }
  const n = normNombre(user?.nombre_perfil);
  return (
    n === PERFIL_NOMBRE.ADMINISTRADOR ||
    n === PERFIL_NOMBRE.SUPERVISOR_PROYECTOS ||
    n === PERFIL_NOMBRE.AUXILIAR
  );
}

/** Edición Contrato / Otro Sí / Remisión (no anular/eliminar destructivo). */
function puedeEditarContrato(user) {
  const id = Number(user?.id_perfil);
  if (id === PERFIL_ID.ADMINISTRADOR || id === PERFIL_ID.SUPERVISOR_PROYECTOS) {
    return true;
  }
  return EDITORES_CONTRATO.has(normNombre(user?.nombre_perfil));
}

function puedeEditarRemision(user) {
  return puedeEditarContrato(user);
}

function puedeEditarActasPago(user) {
  const id = Number(user?.id_perfil);
  if (
    id === PERFIL_ID.ADMINISTRADOR ||
    id === PERFIL_ID.SUPERVISOR_PROYECTOS ||
    id === PERFIL_ID.CONTABILIDAD
  ) {
    return true;
  }
  return EDITORES_ACTAS_PAGO.has(normNombre(user?.nombre_perfil));
}

function esClaveMonetaria(key) {
  const k = String(key || '');
  if (!k) return false;
  if (MONETARY_KEY_RE.test(k)) return true;
  const lower = k.toLowerCase();
  return (
    lower.includes('valor') ||
    lower.startsWith('vr_') ||
    lower === 'facturado' ||
    lower === 'saldo_contrato'
  );
}

function stripMonetaryFieldsDeep(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripMonetaryFieldsDeep);
  if (typeof obj !== 'object') return obj;

  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    if (esClaveMonetaria(key)) {
      out[key] = null;
    } else if (val && typeof val === 'object') {
      out[key] = stripMonetaryFieldsDeep(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function aplicarRestriccionValores(user, payload) {
  if (puedeVerValoresContrato(user)) return payload;
  return stripMonetaryFieldsDeep(payload);
}

/**
 * Excel INVENTARIO: Admin, Auxiliar, Supervisor, Contabilidad,
 * Coordinador de Compras, Almacenista.
 */
const PERFILES_INVENTARIO = new Set([
  PERFIL_NOMBRE.ADMINISTRADOR,
  PERFIL_NOMBRE.AUXILIAR,
  PERFIL_NOMBRE.SUPERVISOR_PROYECTOS,
  PERFIL_NOMBRE.CONTABILIDAD,
  PERFIL_NOMBRE.COORD_COMPRAS,
  PERFIL_NOMBRE.ALMACENISTA,
]);

function puedeAccederInventario(user) {
  const id = Number(user?.id_perfil);
  if (
    id === PERFIL_ID.ADMINISTRADOR ||
    id === PERFIL_ID.SUPERVISOR_PROYECTOS ||
    id === PERFIL_ID.CONTABILIDAD
  ) {
    return true;
  }
  return PERFILES_INVENTARIO.has(normNombre(user?.nombre_perfil));
}

/**
 * INFORMES: Admin (todos), Supervisor / Auxiliar, Contabilidad.
 * El filtrado por tipo de informe está en el front.
 */
function puedeAccederInformes(user) {
  const id = Number(user?.id_perfil);
  if (
    id === PERFIL_ID.ADMINISTRADOR ||
    id === PERFIL_ID.SUPERVISOR_PROYECTOS ||
    id === PERFIL_ID.AUXILIAR ||
    id === PERFIL_ID.CONTABILIDAD
  ) {
    return true;
  }
  const n = normNombre(user?.nombre_perfil);
  return (
    n === PERFIL_NOMBRE.ADMINISTRADOR ||
    n === PERFIL_NOMBRE.SUPERVISOR_PROYECTOS ||
    n === PERFIL_NOMBRE.AUXILIAR ||
    n === PERFIL_NOMBRE.CONTABILIDAD
  );
}

module.exports = {
  PERFIL_ID,
  PERFIL_NOMBRE,
  puedeVerValoresContrato,
  puedeEditarContrato,
  puedeEditarRemision,
  puedeEditarActasPago,
  aplicarRestriccionValores,
  stripMonetaryFieldsDeep,
  puedeAccederInventario,
  puedeAccederInformes,
};
