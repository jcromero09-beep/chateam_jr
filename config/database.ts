import "../bootstrap";
import { Dialect } from "sequelize";
import { assertNotProductionDb } from "../helpers/prodDbGuard";

// Antes de exportar nada: si este proceso iba a hablar con la base de PRODUCCIÓN sin
// declararse de producción, aquí se para. Ver helpers/prodDbGuard — nace del
// incidente en que un guardado desde el repo de desarrollo cifró los tokens de la API
// y dejó a los clientes con integraciones fuera durante seis días.
assertNotProductionDb(process.env.DB_NAME);

export default {
  define: {
    charset: "utf8mb4",
    collate: "utf8mb4_bin"
    // freezeTableName: true
  },
  options: { requestTimeout: 600000, encrypt: true },
  retry: {
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/
    ],
    max: 100
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX) || 100,
    min: parseInt(process.env.DB_POOL_MIN) || 15,
    acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
    idle: parseInt(process.env.DB_POOL_IDLE) || 600000
  },
  dialect: (process.env.DB_DIALECT || "postgres") as Dialect,
  timezone: 'America/Lima',
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  logging: false
};
