#!/usr/bin/env node
/**
 * Ejecuta SQL contra la BD del .env (sosamet_back).
 *
 * Uso:
 *   node scripts/sql.js "SELECT 1"
 *   node scripts/sql.js --file path/to/script.sql
 *   node scripts/sql.js --list-sp
 *   node scripts/sql.js --show-sp NOMBRE_SP
 *
 * Por defecto muestra resultsets en JSON.
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

const args = process.argv.slice(2);

function usage() {
  console.log(`Uso:
  node scripts/sql.js "SQL..."
  node scripts/sql.js --file ruta.sql
  node scripts/sql.js --list-sp
  node scripts/sql.js --show-sp NOMBRE`);
}

function endOk(code = 0) {
  db.end(() => process.exit(code));
}

function run(sql, params = []) {
  db.query(sql, params, (err, results, fields) => {
    if (err) {
      console.error('SQL ERROR:', err.message);
      endOk(1);
      return;
    }

    // CALL / multi-resultset
    if (Array.isArray(results) && results.length && Array.isArray(results[0])) {
      results.forEach((rs, i) => {
        if (!Array.isArray(rs)) return;
        console.log(`\n--- resultset ${i + 1} (${rs.length} filas) ---`);
        console.log(JSON.stringify(rs, null, 2));
      });
    } else if (Array.isArray(results)) {
      console.log(`\n--- ${results.length} filas ---`);
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(JSON.stringify(results, null, 2));
    }

    endOk(0);
  });
}

if (!args.length) {
  usage();
  endOk(1);
} else if (args[0] === '--list-sp') {
  run(
    `SELECT ROUTINE_NAME, ROUTINE_TYPE, CREATED, LAST_ALTERED
     FROM information_schema.ROUTINES
     WHERE ROUTINE_SCHEMA = DATABASE()
     ORDER BY ROUTINE_NAME`
  );
} else if (args[0] === '--show-sp') {
  const name = args[1];
  if (!name || !/^[A-Za-z0-9_]+$/.test(name)) {
    console.error('Nombre de SP inválido');
    endOk(1);
  } else {
    run(`SHOW CREATE PROCEDURE \`${name}\``);
  }
} else if (args[0] === '--file') {
  const file = args[1];
  if (!file) {
    console.error('Falta ruta del archivo');
    endOk(1);
  } else {
    const full = path.resolve(file);
    const sql = fs.readFileSync(full, 'utf8');
    run(sql);
  }
} else {
  run(args.join(' '));
}
