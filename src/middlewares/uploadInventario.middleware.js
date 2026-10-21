const multer = require("multer");
const path = require("path");
const { getInventarioUploadsDir } = require("../config/uploadsPath");

const uploadsDir = getInventarioUploadsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const safeName = String(file.originalname || "foto")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const allowedExt = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"]);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (allowedExt.has(ext) || String(file.mimetype || "").startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten imágenes (JPG, PNG, WEBP, GIF, HEIC)."));
  }
};

const uploadInventario = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
});

module.exports = uploadInventario;
