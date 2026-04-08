process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION:", err.message, err.stack);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("💥 UNHANDLED REJECTION:", reason);
  process.exit(1);
});
process.on("exit", (code) => {
  console.log("🔴 PROCESS EXIT:", code);
});
process.on("SIGTERM", () => console.log("SIGTERM"));
process.on("SIGINT", () => console.log("SIGINT"));

import "./bootstrap";
console.log("✅ 1 bootstrap");
import "./database";
console.log("✅ 2 database");
import "reflect-metadata";
console.log("✅ 3 reflect-metadata");
import "express-async-errors";
console.log("✅ 4 express-async-errors");
import express from "express";
console.log("✅ 5 express");
import "./config/upload";
console.log("✅ 6 uploadConfig");
import "./errors/AppError";
console.log("✅ 7 AppError");
import "./utils/logger";
console.log("✅ 8 logger");
import "./config/logger";
console.log("✅ 9 config/logger");
import "./libs/socket";
console.log("✅ 10 libs/socket");

console.log("✅ TODOS LOS IMPORTS OK - INICIANDO ROUTES...");
import routes from "./routes/index";
console.log("✅ routes/index");
console.log("✅ bootstrap + database + app OK");
process.exit(0);
