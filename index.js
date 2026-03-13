const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const db = require("./src/config/db");

// 🔹 Swagger
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./src/config/swagger");

// 🔹 Middlewares
const { authMiddleware } = require('./src/middlewares/auth.middleware');
const { errorHandler } = require('./src/middlewares/error.middleware');

// 🔹 Importar rutas
const roleRoutes = require("./src/routes/role.routes");
const userRoutes = require('./src/routes/user/createUser.routes')
const getUsers = require('./src/routes/user/getUser.routes')
const changeStateUsers = require('./src/routes/user/changeStateUser.routes')
const updateUsers = require('./src/routes/user/updateUser.routes')

const changePassword = require('./src/routes/auth/changePassword.routes')
const loginUser = require('./src/routes/auth/loginUser.routes')

const typeContracts = require('./src/routes/contracts/getTypeContracts.routes')
const typeFields = require('./src/routes/contracts/getTypeFields.routes')
const insertDataContract = require('./src/routes/contracts/insertContract.routes')
const getContractDetail = require('./src/routes/contracts/contractDetail.routes')
const uploadFile = require('./src/routes/contracts/uploadFilesContracts.routes')
const uploadFileIva = require('./src/routes/contracts/uploadFilesIva.routes')
const uploadExcelOrder = require('./src/routes/contracts/uploadFilesBuyOrder.routes')
const consultPurchaseOrders = require('./src/routes/contracts/consultPurchaseOrders.routes')
const consultRemissions = require('./src/routes/contracts/consultRemissions.routes')
const uploadExcelRemisiones = require('./src/routes/contracts/uploadFilesRemisiones.routes')
const uploadExcelActasPago = require('./src/routes/contracts/uploadFilesActasPago.rutes')
const getCompanies = require('./src/routes/contracts/getCompanies.routes');
const getAllUsers = require('./src/routes/gestion/order-work/getAllusers.routes')
const insertLiquidationCourts = require('./src/routes/gestion/liquidation-courts/insertLiquidationCourts.routes')
const insertOrderWork = require('./src/routes/gestion/order-work/insertOrderWork.routes')

dotenv.config();

const app = express();

const allowedOrigins = [
  'http://localhost:4200',
  'http://sosametsa.sytes.net',
  'http://localhost:3000',             // Swagger local
  'http://127.0.0.1:3000',             // Swagger local alternativo
  'http://sosametsa.sytes.net:3000',   // Swagger vía IP pública
  'https://gd.sosamet.com',
  'https://gd.sosamet.com:3000'
];
  
  app.use(cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('No permitido por CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
app.use(express.json());

// 🔹 Rate limiting específico para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 intentos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 0,
    message: "Demasiados intentos de inicio de sesión. Intenta más tarde.",
  },
});

// 🔹 Documentación Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 🔹 Ruta base
app.get("/", (req, res) => {
    res.send("API de Sosamet funcionando");
});

// Rutas públicas (sin JWT)
app.use('/api/auth/changePassword', changePassword);
app.use('/api/auth/loginUser', loginLimiter, loginUser);

// Rutas protegidas (requieren Authorization: Bearer <token>)
app.use("/api/roles", authMiddleware, roleRoutes);

app.use("/api/createUser", authMiddleware, userRoutes);
app.use('/api/getUsers', authMiddleware, getUsers);
app.use('/api/changeStateUser', authMiddleware, changeStateUsers);
app.use('/api/updateUser', authMiddleware, updateUsers);

app.use('/api/contracts/getTypeContracts', authMiddleware, typeContracts);
app.use('/api/contracts/getTypeFields', authMiddleware, typeFields);
app.use('/api/contracts/purchase-orders', authMiddleware, consultPurchaseOrders);
app.use('/api/contracts/remissions', authMiddleware, consultRemissions);
app.use('/api/contracts', authMiddleware, insertDataContract);
app.use('/api/contracts', authMiddleware, getContractDetail);
app.use('/api/contracts', authMiddleware, uploadFile);
app.use('/api/contracts', authMiddleware, uploadFileIva);
app.use('/api/contracts', authMiddleware, uploadExcelOrder);
app.use('/api/contracts', authMiddleware, uploadExcelRemisiones);
app.use('/api/contracts', authMiddleware, uploadExcelActasPago);
app.use('/api/contracts', authMiddleware, getCompanies);

app.use('/api/gestion', authMiddleware, getAllUsers);
app.use('/api/gestion/liquidation-courts', authMiddleware, insertLiquidationCourts);
app.use('/api/gestion/order-work', authMiddleware, insertOrderWork);

// 🔹 Middleware global de errores (después de todas las rutas)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
