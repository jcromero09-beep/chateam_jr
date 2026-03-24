/**
 * Routes: Email Tracking & Webhooks (Email Marketing Fase 2)
 * Rutas PUBLICAS — NO requieren autenticacion.
 *
 * Tracking Endpoints:
 * GET  /tracking/open/:recipientId         — Tracking pixel (GIF 1x1)
 * GET  /tracking/click/:recipientId        — Link redirect con tracking
 * GET  /tracking/unsubscribe/:recipientId  — Pagina de desuscripcion
 *
 * Webhook Endpoints:
 * POST /webhooks/email/sendgrid  — SendGrid Event Webhook
 * POST /webhooks/email/carbonio  — Carbonio bounce notifications
 * POST /webhooks/email/mailgun   — Mailgun Webhooks
 */

import { Router } from "express";
import * as EmailTrackingController from "../controllers/EmailTrackingController";
import * as EmailWebhookController from "../controllers/EmailWebhookController";

const emailTrackingRoutes = Router();

// ============================================================
// Tracking — PUBLICOS (sin auth)
// Deben ser ultra-rapidos, no bloquear respuesta
// ============================================================

// Tracking pixel (aperturas)
emailTrackingRoutes.get(
  "/tracking/open/:recipientId",
  EmailTrackingController.trackOpen
);

// Link redirect (clicks)
emailTrackingRoutes.get(
  "/tracking/click/:recipientId",
  EmailTrackingController.trackClick
);

// Pagina de desuscripcion
emailTrackingRoutes.get(
  "/tracking/unsubscribe/:recipientId",
  EmailTrackingController.trackUnsubscribe
);

// ============================================================
// Webhooks de proveedores — PUBLICOS (sin auth)
// Los proveedores de email envian eventos aqui
// ============================================================

// SendGrid Event Webhook
emailTrackingRoutes.post(
  "/webhooks/email/sendgrid",
  EmailWebhookController.sendgridWebhook
);

// Carbonio bounce notifications
emailTrackingRoutes.post(
  "/webhooks/email/carbonio",
  EmailWebhookController.carbonioWebhook
);

// Mailgun Webhooks
emailTrackingRoutes.post(
  "/webhooks/email/mailgun",
  EmailWebhookController.mailgunWebhook
);

export default emailTrackingRoutes;
