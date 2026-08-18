const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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
]);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (
    allowedExt.has(ext) ||
    String(file.mimetype || "").startsWith("image/") ||
    String(file.mimetype || "") === "application/pdf"
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Solo se permiten imágenes, PDF o planos (DWG/DXF) para la evidencia."
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
