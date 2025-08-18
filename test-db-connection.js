require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306
    });

    console.log('✅ Conexión a la base de datos exitosa');
    await connection.end();
  } catch (error) {
    console.error('❌ Error conectando a la base de datos:');
    console.error(error.message);
  }
})();
