import nodemailer from "nodemailer";
import logger from "../utils/logger";
import listmonkClient from "./ListmonkClient";

export interface MailData {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * SendMail — Helper transversal de envío de correo.
 *
 * Estrategia (Fase A de integración Listmonk):
 *   1. Si LISTMONK_ENABLED=true → intenta vía Listmonk /api/tx
 *   2. Si Listmonk falla por cualquier motivo → fallback automático a nodemailer
 *      directo contra mail.chateam.ws (comportamiento original)
 *
 * Esto garantiza que correos críticos (forgot-password, signup, notificaciones IA)
 * NUNCA se pierden aunque Listmonk esté caído.
 *
 * Para revertir TODO: poner LISTMONK_ENABLED=false en .env y reiniciar pm2.
 */
async function sendViaListmonk(data: MailData): Promise<boolean> {
  if (!listmonkClient.isEnabled()) return false;

  const result = await listmonkClient.sendTransactional({
    to: data.to,
    subject: data.subject,
    html: data.html || data.text || "",
  });

  if (result.success) {
    return true;
  }

  logger.warn(
    `[SendMail] Listmonk falló (${result.error || "error desconocido"}), usando fallback nodemailer`
  );
  return false;
}

async function sendViaNodemailer(data: MailData): Promise<void> {
  const mailPort = Number(process.env.MAIL_PORT) || 465;
  const options: any = {
    host: process.env.MAIL_HOST,
    port: mailPort,
    secure: process.env.MAIL_ENCRYPTION === "ssl" || mailPort === 465,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  };

  const transporter = nodemailer.createTransport(options);

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: data.to,
    subject: data.subject,
    text: data.text,
    html: data.html || data.text,
  });

  logger.info(`[SendMail/Nodemailer] enviado a ${data.to} | messageId=${info.messageId}`);
}

export async function SendMail(mailData: MailData): Promise<void> {
  const sentByListmonk = await sendViaListmonk(mailData);
  if (sentByListmonk) return;
  await sendViaNodemailer(mailData);
}
