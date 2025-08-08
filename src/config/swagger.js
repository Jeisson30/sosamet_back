const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Sosamet',
      version: '1.0.0',
      description: 'Documentación de la API de Sosamet',
    },
    servers: [
      /*{
        url: 'http://sosametsa.sytes.net/',
        description: 'Servidor productivo',
      },*/
      {
        url: 'http://localhost:3000',
        description: 'Servidor local',
      }
    ],
  },
  apis: ['./src/routes/**/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
