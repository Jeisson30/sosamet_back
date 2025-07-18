const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const db = require("./src/config/db");

// 🔹 Swagger
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./src/config/swagger");

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


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Documentación Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 🔹 Ruta base
app.get("/", (req, res) => {
    res.send("API de Sosamet funcionando");
});

//Rutas

app.use("/api/roles", roleRoutes);

// TODO: Route users

app.use("/api/createUser", userRoutes);
app.use('/api/getUsers', getUsers)
app.use('/api/changeStateUser', changeStateUsers)
app.use('/api/updateUser', updateUsers)

// TODO: Route Auth

app.use('/api/auth/changePassword', changePassword)
app.use('/api/auth/loginUser', loginUser)

// TODO: Route Contracts

app.use('/api/contracts/getTypeContracts', typeContracts)
app.use('/api/contracts/getTypeFields', typeFields)
app.use('/api/contracts', insertDataContract)
app.use('/api/contracts', getContractDetail)


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
