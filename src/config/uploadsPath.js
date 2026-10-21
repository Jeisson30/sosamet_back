const fs = require('fs');
const path = require('path');

/**
 * Carpeta única de adjuntos (multer + express.static deben usar la misma).
 *
 * Prod (FileZilla): `/var/www/html/sosamet_back/uploads`
 * — junto al back, NO dentro de `Front/` ni solo dentro de `dist/`.
 * Opcional: `UPLOADS_DIR=/ruta/absoluta/uploads` en el `.env` del servidor.
 */
function resolveUploadsDir() {
  if (process.env.UPLOADS_DIR && String(process.env.UPLOADS_DIR).trim()) {
    const abs = path.resolve(String(process.env.UPLOADS_DIR).trim());
    fs.mkdirSync(abs, { recursive: true });
    return abs;
  }

  const appRoot = path.dirname(require.main?.filename || process.cwd());
  const cwd = process.cwd();
  const runningFromDist = path.basename(appRoot).toLowerCase() === 'dist';

  // Si Node corre `dist/index.js`, preferir `../uploads` (sosamet_back/uploads)
  // antes que crear/usar `dist/uploads` vacío.
  const candidates = runningFromDist
    ? [
        path.join(appRoot, '..', 'uploads'),
        path.join(cwd, 'uploads'),
        path.join(cwd, '..', 'uploads'),
        path.join(appRoot, 'uploads'),
      ]
    : [
        path.join(appRoot, 'uploads'),
        path.join(cwd, 'uploads'),
        path.join(appRoot, '..', 'uploads'),
        path.join(cwd, '..', 'uploads'),
      ];

  for (const dir of candidates) {
    try {
      const abs = path.resolve(dir);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        return abs;
      }
    } catch {
      // ignore
    }
  }

  const fallback = runningFromDist
    ? path.join(appRoot, '..', 'uploads')
    : path.join(appRoot, 'uploads');
  fs.mkdirSync(fallback, { recursive: true });
  return path.resolve(fallback);
}

const uploadsDir = resolveUploadsDir();

function getUploadsDir() {
  return uploadsDir;
}

function getInventarioUploadsDir() {
  const dir = path.join(uploadsDir, 'inventario');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Ruta relativa para BD / respuestas API: `uploads/<file>` o `uploads/inventario/<file>`.
 * Acepta filename multer, ruta relativa o absoluta.
 */
function toPublicUploadPath(fileOrName, options = {}) {
  const subdir = options.subdir ? String(options.subdir).replace(/^\/+|\/+$/g, '') : '';
  const raw = String(fileOrName || '').trim().replace(/\\/g, '/');
  if (!raw) return null;

  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;

  let rel = raw.replace(/^\/+/, '');
  // Quitar prefijo absoluto si multer pasó path completo dentro de uploads
  const uploadsNorm = uploadsDir.replace(/\\/g, '/').replace(/\/+$/, '');
  if (rel.toLowerCase().startsWith(uploadsNorm.toLowerCase() + '/')) {
    rel = rel.slice(uploadsNorm.length + 1);
  }

  rel = rel.replace(/^api\//i, '');
  if (/^uploads\//i.test(rel)) {
    return rel;
  }

  const base = path.posix.basename(rel);
  return subdir
    ? path.posix.join('uploads', subdir, base)
    : path.posix.join('uploads', base);
}

/**
 * Sustituye valores de campos EAV por rutas públicas cuando hay archivos multipart
 * con el mismo fieldname que el nombre del campo.
 */
function applyUploadedFilesToCampos(campos, files) {
  const list = Array.isArray(campos) ? campos.map((c) => ({ ...c })) : [];
  const fileList = Array.isArray(files) ? files : [];
  const byField = new Map();
  for (const f of fileList) {
    if (f?.fieldname && f?.filename) byField.set(String(f.fieldname), f);
  }

  const seen = new Set();
  for (const campo of list) {
    const name = String(campo?.nombre ?? '').trim();
    if (!name) continue;
    const file = byField.get(name);
    if (file) {
      campo.valor = toPublicUploadPath(file.filename);
      seen.add(name);
    }
  }

  for (const [name, file] of byField.entries()) {
    if (seen.has(name)) continue;
    if (name === 'file' || name.startsWith('file_') || name.startsWith('evidencia_')) {
      continue;
    }
    list.push({
      nombre: name,
      valor: toPublicUploadPath(file.filename),
    });
  }

  return list;
}

module.exports = {
  getUploadsDir,
  getInventarioUploadsDir,
  resolveUploadsDir,
  toPublicUploadPath,
  applyUploadedFilesToCampos,
};
