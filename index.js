const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const path = require("path");
// Cargar .env ANTES de cualquier otro require (db, rutas, controllers).
dotenv.config({ override: true, path: path.join(__dirname, '.env') });

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
const catalogUserRoutes = require('./src/routes/user/catalogUser.routes')
const getUsers = require('./src/routes/user/getUser.routes')
const changeStateUsers = require('./src/routes/user/changeStateUser.routes')
const updateUsers = require('./src/routes/user/updateUser.routes')
const deleteUsers = require('./src/routes/user/deleteUser.routes')

const changePassword = require('./src/routes/auth/changePassword.routes')
const loginUser = require('./src/routes/auth/loginUser.routes')
const forgotPassword = require('./src/routes/auth/forgotPassword.routes')

const typeContracts = require('./src/routes/contracts/getTypeContracts.routes')
const typeFields = require('./src/routes/contracts/getTypeFields.routes')
const insertDataContract = require('./src/routes/contracts/insertContract.routes')
const insertContractWithPlano = require('./src/routes/contracts/insertContractWithPlano.routes')
const getContractDetail = require('./src/routes/contracts/contractDetail.routes')
const uploadFile = require('./src/routes/contracts/uploadFilesContracts.routes')
const uploadFileIva = require('./src/routes/contracts/uploadFilesIva.routes')
const uploadExcelOrder = require('./src/routes/contracts/uploadFilesBuyOrder.routes')
const consultPurchaseOrders = require('./src/routes/contracts/consultPurchaseOrders.routes')
const consultRemissions = require('./src/routes/contracts/consultRemissions.routes')
const consultContracts = require('./src/routes/contracts/consultContracts.routes')
const consultAsistencia = require('./src/routes/contracts/consultAsistencia.routes')
const asistenciaVisit = require('./src/routes/contracts/asistenciaVisit.routes')
const otroSiRoutes = require('./src/routes/contracts/otroSi.routes');
const memoriasRoutes = require('./src/routes/contracts/memorias.routes');
const actasPagoRoutes = require('./src/routes/contracts/actasPago.routes');
const uploadExcelRemisiones = require('./src/routes/contracts/uploadFilesRemisiones.routes')
const uploadExcelActasPago = require('./src/routes/contracts/uploadFilesActasPago.rutes')
const insertActasMedidaDetalle = require('./src/routes/contracts/insertActasMedidaDetalle.routes')
const generarConsecutivo = require('./src/routes/contracts/generarConsecutivo.routes')
const consultarContratos = require('./src/routes/contracts/consultarContratos.routes')
const consultActasMedida = require('./src/routes/contracts/consultActasMedida.routes')
const consultActasDisenador = require('./src/routes/contracts/consultActasDisenador.routes')
const getCompanies = require('./src/routes/contracts/getCompanies.routes');
const getAllUsers = require('./src/routes/gestion/order-work/getAllusers.routes')
const insertLiquidationCourts = require('./src/routes/gestion/liquidation-courts/insertLiquidationCourts.routes')
const insertOrderWork = require('./src/routes/gestion/order-work/insertOrderWork.routes')
const ejecucionCortes = require('./src/routes/gestion/ejecucion-cortes/ejecucionCortes.routes')
const catalogRoutes = require('./src/routes/catalog.routes');
const administracionRoutes = require('./src/routes/administracion/administracion.routes');
const { requireAdminOrSupervisor } = require('./src/middlewares/adminOrSupervisor.middleware');
const reportRoutes = require('./src/routes/reports/reports.routes');
const inventarioRoutes = require('./src/routes/inventario/inventario.routes');
const { requireAdmin } = require('./src/middlewares/admin.middleware');
const { requireInventarioAccess } = require('./src/middlewares/inventario.middleware');
const { requireInformesAccess } = require('./src/middlewares/informes.middleware');

const app = express();
app.set('trust proxy', 1);

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

// Evita 304 con datos viejos de otra BD/sesión (catálogos dinámicos).
app.set('etag', false);
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
  
// Inventario recibe archivos planos con miles de ítems; el parser general sigue en 100kb.
app.use('/api/inventario', express.json({ limit: '5mb' }));
app.use(express.json());

// Archivos de evidencia / adjuntos (misma carpeta que multer)
const { getUploadsDir } = require('./src/config/uploadsPath');
const uploadsDir = getUploadsDir();
// eslint-disable-next-line no-console
console.log(`Uploads dir: ${uploadsDir}`);
app.use('/uploads', express.static(uploadsDir));
// En producción el proxy solo envía /api/* a Node; usar /api/uploads.
app.use('/api/uploads', express.static(uploadsDir));

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

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 0,
    message: 'Demasiados intentos de recuperación. Intenta más tarde.',
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
app.use('/api/auth/forgotPassword', forgotPasswordLimiter, forgotPassword);

// Rutas protegidas (requieren Authorization: Bearer <token>)
app.use("/api/roles", authMiddleware, roleRoutes);

app.use("/api/createUser", authMiddleware, requireAdmin, userRoutes);
app.use('/api/catalogUsers', authMiddleware, requireAdmin, catalogUserRoutes);
app.use('/api/getUsers', authMiddleware, requireAdmin, getUsers);
app.use('/api/changeStateUser', authMiddleware, requireAdmin, changeStateUsers);
app.use('/api/updateUser', authMiddleware, requireAdmin, updateUsers);
app.use('/api/deleteUser', authMiddleware, requireAdmin, deleteUsers);

app.use('/api/contracts/getTypeContracts', authMiddleware, typeContracts);
app.use('/api/contracts/getTypeFields', authMiddleware, typeFields);
app.use('/api/contracts/purchase-orders', authMiddleware, consultPurchaseOrders);
app.use('/api/contracts/remissions', authMiddleware, consultRemissions);
app.use('/api/contracts/actas-medida', authMiddleware, consultActasMedida);
app.use('/api/contracts/actas-disenador', authMiddleware, consultActasDisenador);
app.use('/api/contracts/consult-contracts', authMiddleware, consultContracts);
app.use('/api/contracts/consult-asistencia', authMiddleware, consultAsistencia);
app.use('/api/contracts/asistencia', authMiddleware, asistenciaVisit);
app.use('/api/contracts/otro-si', authMiddleware, otroSiRoutes);
app.use('/api/contracts/memorias', authMiddleware, memoriasRoutes);
app.use('/api/contracts/actas-pago', authMiddleware, actasPagoRoutes);
app.use('/api/contracts', authMiddleware, insertDataContract);
app.use('/api/contracts', authMiddleware, insertContractWithPlano);
app.use('/api/contracts', authMiddleware, getContractDetail);
app.use('/api/contracts', authMiddleware, uploadFile);
app.use('/api/contracts', authMiddleware, uploadFileIva);
app.use('/api/contracts', authMiddleware, uploadExcelOrder);
app.use('/api/contracts', authMiddleware, uploadExcelRemisiones);
app.use('/api/contracts', authMiddleware, uploadExcelActasPago);
app.use('/api/contracts', authMiddleware, insertActasMedidaDetalle);
app.use('/api/contracts', authMiddleware, generarConsecutivo);
app.use('/api/contracts', authMiddleware, consultarContratos);
app.use('/api/contracts', authMiddleware, getCompanies);

app.use('/api/gestion', authMiddleware, getAllUsers);
app.use('/api/gestion/liquidation-courts', authMiddleware, insertLiquidationCourts);
app.use('/api/gestion/order-work', authMiddleware, insertOrderWork);
app.use('/api/gestion/ejecucion-cortes', authMiddleware, ejecucionCortes);
app.use('/api/catalog', authMiddleware, catalogRoutes);
app.use(
  '/api/administracion',
  authMiddleware,
  requireAdminOrSupervisor,
  administracionRoutes
);
app.use('/api/reports', authMiddleware, requireInformesAccess, reportRoutes);
app.use('/api/inventario', authMiddleware, requireInventarioAccess, inventarioRoutes);

// 🔹 Middleware global de errores (después de todas las rutas)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
