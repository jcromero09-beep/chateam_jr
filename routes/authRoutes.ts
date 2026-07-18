import { Router } from "express";
import * as SessionController from "../controllers/SessionController";
import * as UserController from "../controllers/UserController";
import * as PasswordController from "../controllers/PasswordController";
import isAuth from "../middleware/isAuth";
import envTokenAuth from "../middleware/envTokenAuth";
import * as SettingController from "../controllers/SettingController";
// [Ola 2 seguridad] El rate limiter existía (middleware/rateLimiter.ts) pero NO estaba
// cableado a ninguna ruta → el login no protegía contra fuerza bruta (verificado: 8
// intentos fallidos, 0 respuestas 429). authLimiter: 5 fallos/15min por ip:email, con
// skipSuccessfulRequests (los logins OK no cuentan → usuarios legítimos no afectados);
// usa memory store (NO añade dependencia de Redis al login).
import { authLimiter, signupLimiter } from "../middleware/rateLimiter";

const authRoutes = Router();

authRoutes.post("/signup", signupLimiter, UserController.store);
authRoutes.post("/google/verify", UserController.verifyGoogle);

// Recuperación de contraseña (rutas públicas, sin isAuth) — protegidas contra abuso.
authRoutes.post("/forgot-password", authLimiter, PasswordController.forgotPassword);
authRoutes.post("/reset-password", PasswordController.resetPassword);
authRoutes.post("/login", authLimiter, SessionController.store);
authRoutes.post("/refresh_token", SessionController.update);
authRoutes.get("/validate", isAuth, SessionController.validate);
authRoutes.delete("/logout", isAuth, SessionController.remove);
authRoutes.get("/me", isAuth, SessionController.me);

// Rutas para términos en el contexto de autenticación
authRoutes.get("/signup/terms/:type", SettingController.getPublicTerms); // Para mostrar en signup
authRoutes.post("/signup/accept-terms", isAuth, SettingController.acceptTerms); // Para aceptar después de registro

export default authRoutes;
