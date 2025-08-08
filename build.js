// build.js
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Ejecutar build con esbuild
esbuild.build({
  entryPoints: ['index.js'],
  bundle: true,
  platform: 'node',
  outdir: 'dist',
  external: ['bcrypt', 'bcryptjs', 'mysql2', 'express', 'cors', 'dotenv', 'jsonwebtoken', 'nodemailer', 'swagger-ui-express', 'swagger-jsdoc'],
  target: ['node16'],
}).then(() => {
  // Copiar archivos necesarios al dist
  fs.copyFileSync(path.resolve(__dirname, '.env'), path.resolve(__dirname, 'dist/.env'));
  fs.copyFileSync(path.resolve(__dirname, 'package.json'), path.resolve(__dirname, 'dist/package.json'));

  // Opcional: copia también package-lock.json si lo usas
  const lockPath = path.resolve(__dirname, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    fs.copyFileSync(lockPath, path.resolve(__dirname, 'dist/package-lock.json'));
  }

  console.log('✅ Build completo. Se copiaron .env, package.json y package-lock.json a dist/');
}).catch((err) => {
  console.error('❌ Error en el build:', err);
});
