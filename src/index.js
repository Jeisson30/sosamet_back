const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const db = require("./config/db");

// 🔹 Swagger
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

// 🔹 Importar rutas
const roleRoutes = require("./routes/role.routes");
const userRoutes = require('./routes/user/createUser.routes')
const getUsers = require('./routes/user/getUser.routes')
const changeStateUsers = require('./routes/user/changeStateUser.routes')
const updateUsers = require('./routes/user/updateUser.routes')

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
