import { Request, Response } from "express";
import ForgotPasswordService from "../services/AuthServices/ForgotPasswordService";
import ResetPasswordService from "../services/AuthServices/ResetPasswordService";
import AppError from "../errors/AppError";

/**
 * POST /api/auth/forgot-password
 * Solicita enlace de recuperación de contraseña vía email
 * SEGURIDAD: Siempre retorna éxito (no revela si el email existe)
 */
export const forgotPassword = async (req: Request, res: Response): Promise<Response> => {
  const { email } = req.body;

  if (!email || !email.trim()) {
    return res.status(400).json({
      success: false,
      message: "El email es requerido"
    });
  }

  try {
    await ForgotPasswordService({ email: email.trim() });
  } catch (err) {
    // Log interno pero NO exponer al usuario
    console.error("[PasswordController] forgotPassword error:", err);
  }

  // Siempre retornar éxito por seguridad
  return res.json({
    success: true,
    message: "Si el email está registrado, recibirás un enlace de recuperación."
  });
};

/**
 * POST /api/auth/reset-password
 * Restablece la contraseña usando el token del email
 */
export const resetPassword = async (req: Request, res: Response): Promise<Response> => {
  const { token, password } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: "Token es requerido"
    });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "La contraseña debe tener al menos 6 caracteres"
    });
  }

  try {
    await ResetPasswordService({ token, password });
    return res.json({
      success: true,
      message: "Contraseña actualizada exitosamente."
    });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message
      });
    }
    console.error("[PasswordController] resetPassword error:", err);
    return res.status(500).json({
      success: false,
      message: "Error al restablecer la contraseña"
    });
  }
};
