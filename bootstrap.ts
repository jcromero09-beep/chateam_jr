import dotenv from "dotenv";

dotenv.config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env"
});

// [Auditoría · Ola 2] Enruta console.* por el logger (pino + sanitización).
// Debe ir aquí (bootstrap se importa primero en server-distributed y worker).
import "./utils/consoleToLogger";
