import { randomBytes } from "crypto";
import { Op } from "sequelize";
import User from "../../models/User";
import { SendMail } from "../../helpers/SendMail";
import AppError from "../../errors/AppError";

interface Request {
  email: string;
}

const ForgotPasswordService = async ({ email }: Request): Promise<void> => {
  const user = await User.findOne({
    where: { email: { [Op.iLike]: email.trim() } }
  });

  // SEGURIDAD: No revelar si el email existe o no
  if (!user) {
    console.log(`[ForgotPassword] Email no encontrado: ${email}`);
    return;
  }

  // Generar token aleatorio de 32 bytes (64 chars hex)
  const resetToken = randomBytes(32).toString("hex");

  // Expira en 30 minutos
  const resetExpires = new Date(Date.now() + 30 * 60 * 1000);

  // Guardar token en BD
  await user.update({
    resetPasswordToken: resetToken,
    resetPasswordExpires: resetExpires
  });

  // URL del frontend para resetear
  const frontendUrl = process.env.FRONTEND_URL || "https://chat.chateam.ws";
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  // Enviar email
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #005060, #003844); padding: 30px; text-align: center; }
        .header img { width: 60px; height: 60px; }
        .header h1 { color: #20D0D0; font-size: 22px; margin: 10px 0 0; }
        .body { padding: 30px; }
        .body p { color: #333; line-height: 1.6; margin: 0 0 15px; }
        .btn { display: inline-block; background: #20D0D0; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; }
        .btn:hover { background: #1ab8b8; }
        .footer { padding: 20px 30px; background: #f9f9f9; text-align: center; font-size: 12px; color: #999; }
        .code { background: #f0f0f0; padding: 8px 16px; border-radius: 6px; font-family: monospace; font-size: 14px; word-break: break-all; color: #555; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Chateam Pro</h1>
        </div>
        <div class="body">
          <p>Hola <strong>${user.name}</strong>,</p>
          <p>Recibimos una solicitud para restablecer tu contrasena. Haz clic en el siguiente boton para crear una nueva:</p>
          <p style="text-align:center; margin: 25px 0;">
            <a href="${resetUrl}" class="btn">Restablecer Contrasena</a>
          </p>
          <p>Si el boton no funciona, copia y pega este enlace en tu navegador:</p>
          <p class="code">${resetUrl}</p>
          <p style="color:#999; font-size:13px; margin-top:20px;">
            Este enlace expira en <strong>30 minutos</strong>. Si no solicitaste este cambio, puedes ignorar este email.
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} CodigoPlus — Chateam Pro
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await SendMail({
      to: user.email,
      subject: "Recuperacion de contrasena — Chateam Pro",
      html: htmlContent,
      text: `Hola ${user.name}, usa este enlace para restablecer tu contrasena: ${resetUrl} (expira en 30 minutos)`
    });

    console.log(`[ForgotPassword] Email enviado a: ${user.email}`);
  } catch (err) {
    console.error("[ForgotPassword] Error enviando email:", err);
    // Limpiar token si falla el envio
    await user.update({
      resetPasswordToken: null,
      resetPasswordExpires: null
    });
    throw new AppError("Error al enviar el email de recuperacion. Intenta de nuevo.", 500);
  }
};

export default ForgotPasswordService;
