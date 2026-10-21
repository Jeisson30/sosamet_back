const multer = require("multer");
const path = require("path");
const { getUploadsDir } = require("../config/uploadsPath");

const uploadsDir = getUploadsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const safeName = String(file.originalname || "evidencia")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const allowedExt = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".pdf",
  ".dwg",
  ".dxf",
  // Formularios mixtos (insert + plano / adjuntos EAV)
  ".xlsx",
  ".xls",
]);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "");
  if (
    allowedExt.has(ext) ||
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Solo se permiten imágenes, PDF, planos (DWG/DXF) o Excel."
      )
    );
  }
};

const uploadEvidence = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

module.exports = uploadEvidence;
