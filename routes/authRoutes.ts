import { Router } from "express";
import * as SessionController from "../controllers/SessionController";
import * as UserController from "../controllers/UserController";
import * as PasswordController from "../controllers/PasswordController";
import isAuth from "../middleware/isAuth";
import envTokenAuth from "../middleware/envTokenAuth";
import * as SettingController from "../controllers/SettingController";

const authRoutes = Router();

authRoutes.post("/signup", UserController.store);

// Recuperación de contraseña (rutas públicas, sin isAuth)
authRoutes.post("/forgot-password", PasswordController.forgotPassword);
authRoutes.post("/reset-password", PasswordController.resetPassword);
authRoutes.post("/login", SessionController.store);
authRoutes.post("/refresh_token", SessionController.update);
authRoutes.get("/validate", isAuth, SessionController.validate);
authRoutes.delete("/logout", isAuth, SessionController.remove);
authRoutes.get("/me", isAuth, SessionController.me);

// Rutas para términos en el contexto de autenticación
authRoutes.get("/signup/terms/:type", SettingController.getPublicTerms); // Para mostrar en signup
authRoutes.post("/signup/accept-terms", isAuth, SettingController.acceptTerms); // Para aceptar después de registro

export default authRoutes;
