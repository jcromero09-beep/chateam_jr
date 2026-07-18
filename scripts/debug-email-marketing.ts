/**
 * Script de debug end-to-end de Email Marketing.
 *
 * Ejecuta el flujo completo SIN tocar PM2:
 *   1. Asegura EmailProviderConfig listmonk activo para una company
 *   2. Crea (o reutiliza) ContactList sincronizada con Listmonk
 *   3. Agrega un ContactListItem de prueba
 *   4. Crea (o reutiliza) EmailTemplate "Bienvenido a ChatEAM" sincronizada con Listmonk
 *   5. Crea EmailCampaign con esa lista + plantilla
 *   6. La programa para +5 minutos en el futuro
 *   7. Reporta cada paso con timing
 *
 * Uso:
 *   npx tsx scripts/debug-email-marketing.ts [companyId] [destinatario]
 *   ej: npx tsx scripts/debug-email-marketing.ts 1 jheyprogrammer@gmail.com
 *
 * NO modifica PM2. NO toca BD destructivamente. Idempotente.
 */
import "dotenv/config";
import "../database";

import EmailProviderConfig from "../models/EmailMarketing/EmailProviderConfig";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";
import EmailTemplate from "../models/EmailMarketing/EmailTemplate";
import EmailCampaign from "../models/EmailMarketing/EmailCampaign";
import User from "../models/User";
import { EmailMarketingFactory } from "../services/EmailMarketing/providers/EmailMarketingFactory";
import EmailTemplateService from "../services/EmailMarketing/EmailTemplateService";

// ============================================================================
// Plantilla "Bienvenido a ChatEAM" — colores Lotru/MEMORY.md
// ============================================================================

const BIENVENIDA_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bienvenido a ChatEAM</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f9fa;font-family:'Be Vietnam Pro','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;color:#1e293b;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f8f9fa;">
<tr>
<td align="center" style="padding:40px 16px;">

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.08);">

<!-- Header oscuro estilo sidebar ChatEAM -->
<tr>
<td style="background:linear-gradient(135deg,#1e293b 0%,#152030 50%,#1a2535 100%);padding:40px 40px 32px;text-align:center;">
  <div style="font-size:32px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1;margin:0 0 8px;">
    Chat<span style="color:#3b82f6;">EAM</span>
  </div>
  <p style="color:#cbd5e1;font-size:14px;margin:0;font-weight:500;">
    Plataforma CRM Omnicanal
  </p>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:48px 48px 40px;">
  <h1 style="color:#1e293b;font-size:24px;font-weight:700;margin:0 0 8px;letter-spacing:-0.3px;">
    Bienvenido, {{ .Subscriber.Name }}
  </h1>
  <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
    Nos alegra tenerte con nosotros. Tu cuenta de <strong style="color:#1e293b;">ChatEAM</strong>
    ya esta lista para que centralices todas tus conversaciones de WhatsApp, Facebook, Instagram,
    Telegram y email en un solo lugar.
  </p>

  <!-- CTA principal -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 32px;">
  <tr>
  <td style="border-radius:8px;background-color:#3b82f6;">
    <a href="https://chat.chateam.ws" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.2px;">
      Ir a mi panel
    </a>
  </td>
  </tr>
  </table>

  <!-- Caracteristicas -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:8px;">
  <tr>
    <td style="padding:0 0 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td width="44" valign="top" style="padding-top:2px;">
          <div style="width:36px;height:36px;background-color:#dbeafe;border-radius:8px;display:inline-block;text-align:center;line-height:36px;font-size:18px;color:#3b82f6;font-weight:700;">A</div>
        </td>
        <td valign="top">
          <p style="color:#1e293b;font-size:14px;font-weight:600;margin:0 0 4px;">WhatsApp + Multicanal</p>
          <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0;">Integra tus canales y atiende todo desde una sola bandeja.</p>
        </td>
      </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td width="44" valign="top" style="padding-top:2px;">
          <div style="width:36px;height:36px;background-color:#dcfce7;border-radius:8px;display:inline-block;text-align:center;line-height:36px;font-size:18px;color:#52b788;font-weight:700;">B</div>
        </td>
        <td valign="top">
          <p style="color:#1e293b;font-size:14px;font-weight:600;margin:0 0 4px;">Agentes IA + Automatizaciones</p>
          <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0;">Configura agentes de IA que responden 24/7 y FlowBuilder para tus flujos.</p>
        </td>
      </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td width="44" valign="top" style="padding-top:2px;">
          <div style="width:36px;height:36px;background-color:#fef3c7;border-radius:8px;display:inline-block;text-align:center;line-height:36px;font-size:18px;color:#f3a43b;font-weight:700;">C</div>
        </td>
        <td valign="top">
          <p style="color:#1e293b;font-size:14px;font-weight:600;margin:0 0 4px;">Campanas y Email Marketing</p>
          <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0;">Envia campanas masivas con tracking de aperturas, clicks y bounces.</p>
        </td>
      </tr>
      </table>
    </td>
  </tr>
  </table>

  <!-- Divider -->
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 24px;">

  <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">
    Si tienes preguntas, escribenos a <a href="mailto:soporte@chateam.ws" style="color:#3b82f6;text-decoration:none;font-weight:500;">soporte@chateam.ws</a>.
    Estamos para ayudarte a sacarle el maximo provecho a la plataforma.
  </p>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#f1f5f9;padding:24px 48px;text-align:center;border-top:1px solid #e2e8f0;">
  <p style="color:#64748b;font-size:12px;line-height:1.5;margin:0 0 6px;font-weight:500;">
    ChatEAM JR
  </p>
  <p style="color:#94a3b8;font-size:11px;margin:0;">
    Recibes este correo porque te registraste en ChatEAM.
    <br>
    <a href="{{ UnsubscribeURL }}" style="color:#94a3b8;text-decoration:underline;">Desuscribirse</a>
    &nbsp;|&nbsp;
    <a href="https://chateam.ws" style="color:#94a3b8;text-decoration:underline;">chateam.ws</a>
  </p>
</td>
</tr>

</table>

</td>
</tr>
</table>
</body>
</html>`;

// ============================================================================
// Helpers de logging
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m"
};

function step(num: number, title: string): void {
  console.log(`\n${colors.cyan}▶ Paso ${num}: ${title}${colors.reset}`);
}
function ok(msg: string): void {
  console.log(`  ${colors.green}✓${colors.reset} ${msg}`);
}
function warn(msg: string): void {
  console.log(`  ${colors.yellow}⚠${colors.reset} ${msg}`);
}
function fail(msg: string): never {
  console.log(`  ${colors.red}✗${colors.reset} ${msg}`);
  process.exit(1);
}
function info(msg: string): void {
  console.log(`    ${colors.gray}${msg}${colors.reset}`);
}

// ============================================================================
// Main
// ============================================================================

const main = async (): Promise<void> => {
  const companyId = parseInt(process.argv[2] || "1", 10);
  const destinatario = process.argv[3] || "jheyprogrammer@gmail.com";

  console.log(`\n${colors.blue}╔════════════════════════════════════════════════════════╗`);
  console.log(`║  Debug end-to-end Email Marketing — ChatEAM JR        ║`);
  console.log(`╚════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log(`  Company:        ${companyId}`);
  console.log(`  Destinatario:   ${destinatario}`);
  console.log(`  Plantilla:      Bienvenido a ChatEAM (colores Lotru)`);
  console.log(`  Programacion:   +5 minutos desde ahora\n`);

  // -------- Paso 1: User valido para createdBy --------
  step(1, "Resolver user creador");
  const user = await User.findOne({ where: { companyId } });
  if (!user) fail(`No hay users para company ${companyId}`);
  ok(`User encontrado: id=${user.id}, email=${user.email}`);

  // -------- Paso 2: Asegurar EmailProviderConfig listmonk activa --------
  step(2, "Asegurar EmailProviderConfig listmonk activa");
  let cfg = await EmailProviderConfig.findOne({
    where: { companyId, provider: "listmonk" }
  });
  if (!cfg) {
    cfg = await EmailProviderConfig.create({
      companyId,
      provider: "listmonk",
      apiKey: process.env.LISTMONK_API_USER || "chateam_app",
      apiSecret: process.env.LISTMONK_API_TOKEN || "",
      isActive: true,
      settings: {
        listmonkUrl: process.env.LISTMONK_URL || "http://192.168.100.21:9000",
        passthroughTemplateId: parseInt(process.env.LISTMONK_PASSTHROUGH_TEMPLATE_ID || "0", 10),
        transactionalListId: parseInt(process.env.LISTMONK_TRANSACTIONAL_LIST_ID || "0", 10),
        fromEmail: process.env.LISTMONK_FROM_EMAIL || "soporte@chateam.ws",
        fromName: process.env.LISTMONK_FROM_NAME || "soporte chateam"
      }
    } as any);
    ok(`Config creada: id=${cfg.id}`);
  } else {
    if (!cfg.isActive) {
      // Desactivar otros e activar este
      await EmailProviderConfig.update(
        { isActive: false },
        { where: { companyId, isActive: true } }
      );
      await cfg.update({ isActive: true });
    }
    ok(`Config existente: id=${cfg.id}, isActive=${cfg.isActive}`);
  }

  // -------- Paso 3: Resolver provider activo --------
  step(3, "Resolver provider activo via EmailMarketingFactory");
  const provider = await EmailMarketingFactory.getProvider(companyId);
  ok(`Provider: ${provider.getProviderName()}`);
  const valid = await provider.validateConfig();
  if (!valid) fail("validateConfig() retorno false");
  ok("validateConfig() = true");

  // -------- Paso 4: Crear/asegurar ContactList sincronizada --------
  step(4, "Crear/reutilizar ContactList \"Lista Bienvenida ChatEAM\"");
  const listName = "Lista Bienvenida ChatEAM (debug)";
  let contactList = await ContactList.findOne({
    where: { companyId, name: listName }
  });
  if (contactList) {
    info(`Lista ya existe: id=${contactList.id}, providerListId=${contactList.providerListId || "(null)"}`);
  } else {
    const r = await provider.createList({
      name: listName,
      fromEmail: cfg.verifiedSenderEmail || "soporte@chateam.ws",
      fromName: cfg.verifiedSenderName || "soporte chateam",
      description: "Lista creada por debug-email-marketing.ts"
    });
    if (!r.success || !r.data) fail(`createList fallo: ${r.error}`);
    ok(`Lista creada en provider: ${r.data.providerListId}`);

    contactList = await ContactList.create({
      name: listName,
      companyId,
      isEmailList: true,
      provider: provider.getProviderName(),
      providerListId: r.data.providerListId,
      fromEmail: cfg.verifiedSenderEmail || "soporte@chateam.ws",
      fromName: cfg.verifiedSenderName || "soporte chateam"
    } as any);
    ok(`Lista persistida local: id=${contactList.id}`);
  }
  if (!contactList.providerListId) {
    // Sync si no esta sincronizada
    const r = await provider.createList({ name: contactList.name });
    if (r.success && r.data) {
      await contactList.update({
        provider: provider.getProviderName(),
        providerListId: r.data.providerListId
      });
      ok(`Lista re-sincronizada: providerListId=${r.data.providerListId}`);
    }
  }

  // -------- Paso 5: Agregar suscriptor de prueba --------
  step(5, `Agregar suscriptor ${destinatario}`);
  const r5 = await provider.createSubscriber(contactList.providerListId!, {
    email: destinatario,
    name: "Jhey Programmer (debug)"
  });
  if (!r5.success) {
    warn(`createSubscriber: ${r5.error}`);
  } else {
    ok(`Suscriptor en provider: id=${r5.data?.providerSubscriberId}`);
  }

  // Local
  const [item, created] = await ContactListItem.findOrCreate({
    where: { email: destinatario, contactListId: contactList.id, companyId },
    defaults: {
      name: "Jhey Programmer",
      email: destinatario,
      number: "",
      contactListId: contactList.id,
      companyId,
      isWhatsappValid: true
    } as any
  });
  ok(`Suscriptor local: id=${item.id} (${created ? "creado" : "ya existia"})`);

  // -------- Paso 6: Crear/reutilizar EmailTemplate --------
  step(6, "Crear/reutilizar plantilla \"Bienvenido a ChatEAM\"");
  const tplName = "Bienvenido a ChatEAM (debug)";
  let tpl = await EmailTemplate.findOne({
    where: { companyId, name: tplName }
  });
  if (tpl) {
    info(`Plantilla ya existe: id=${tpl.id}, providerTemplateId=${tpl.providerTemplateId || "(null)"}`);
    // Actualizar contenido
    tpl = await EmailTemplateService.update(companyId, tpl.id, {
      htmlContent: BIENVENIDA_HTML,
      subject: "Bienvenido a ChatEAM 👋",
      previewText: "Tu cuenta esta lista. Centraliza WhatsApp, Email, Facebook, Telegram en un solo lugar.",
      status: "active"
    });
  } else {
    tpl = await EmailTemplateService.create(companyId, user.id, {
      name: tplName,
      subject: "Bienvenido a ChatEAM, {{ .Subscriber.Name | default \"amigo\" }}",
      previewText: "Tu cuenta esta lista. Centraliza WhatsApp, Email, Facebook, Telegram en un solo lugar.",
      htmlContent: BIENVENIDA_HTML,
      type: "campaign",
      category: "welcome",
      status: "active",
      tags: ["welcome", "onboarding", "debug"]
    });
  }
  ok(`Plantilla local: id=${tpl.id}`);
  if (tpl.providerTemplateId) {
    ok(`Plantilla sincronizada en provider: providerTemplateId=${tpl.providerTemplateId}`);
  } else {
    warn("Plantilla NO tiene providerTemplateId (Listmonk pudo haber rechazado el sync). Continuamos con HTML inline.");
  }

  // -------- Paso 7: Crear campana en provider --------
  step(7, "Crear campana en Listmonk");
  const sendAt = new Date(Date.now() + 5 * 60 * 1000); // +5 min
  const camp = await provider.createCampaign({
    name: `Bienvenida ChatEAM ${new Date().toISOString()}`,
    subject: tpl.subject,
    htmlContent: tpl.htmlContent,
    fromEmail: cfg.verifiedSenderEmail || "soporte@chateam.ws",
    fromName: cfg.verifiedSenderName || "soporte chateam",
    providerListIds: [contactList.providerListId!],
    providerTemplateId: tpl.providerTemplateId || null,
    sendAt
  });
  if (!camp.success || !camp.data) fail(`createCampaign fallo: ${camp.error}`);
  ok(`Campana creada en provider: providerCampaignId=${camp.data.providerCampaignId}`);

  // -------- Paso 8: Programar campana --------
  step(8, "Programar campana");
  const sched = await provider.scheduleCampaign(camp.data.providerCampaignId, sendAt);
  if (!sched.success) {
    warn(`scheduleCampaign fallo: ${sched.error}`);
    info("Intentando startCampaign (envio inmediato) como fallback");
    const start = await provider.startCampaign(camp.data.providerCampaignId);
    if (!start.success) fail(`startCampaign tambien fallo: ${start.error}`);
    ok("Campana INICIADA (envio inmediato)");
  } else {
    ok(`Campana PROGRAMADA para ${sendAt.toISOString()}`);
  }

  // -------- Paso 9: Persistir EmailCampaign local --------
  step(9, "Persistir EmailCampaign local");
  const localCamp = await EmailCampaign.create({
    name: `Bienvenida ChatEAM ${sendAt.toISOString().slice(0, 16)}`,
    subject: tpl.subject,
    htmlContent: tpl.htmlContent,
    templateId: tpl.id,
    status: sched.success ? "PROGRAMADA" : "EN_ANDAMENTO",
    sendAt,
    contactListId: contactList.id,
    companyId,
    provider: provider.getProviderName(),
    providerCampaignId: camp.data.providerCampaignId,
    sendIntervalSeconds: 0,
    dispatchMode: "provider_native",
    settings: {
      launchNow: !sched.success,
      trackOpens: true,
      trackClicks: true,
      fromEmail: cfg.verifiedSenderEmail,
      fromName: cfg.verifiedSenderName,
      debug: true
    }
  } as any);
  ok(`EmailCampaign local: id=${localCamp.id}`);

  // ----- Resumen -----
  console.log(`\n${colors.green}╔════════════════════════════════════════════════════════╗`);
  console.log(`║  ✓ DEBUG COMPLETADO CON EXITO                          ║`);
  console.log(`╚════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log(`\n${colors.cyan}Resumen:${colors.reset}`);
  console.log(`  Company:                 ${companyId}`);
  console.log(`  Provider:                ${provider.getProviderName()}`);
  console.log(`  Lista local:             id=${contactList.id} (${contactList.name})`);
  console.log(`  Lista en Listmonk:       id=${contactList.providerListId}`);
  console.log(`  Suscriptor:              ${destinatario}`);
  console.log(`  Plantilla:               id=${tpl.id} (${tpl.name})`);
  console.log(`  Plantilla en Listmonk:   ${tpl.providerTemplateId || "(no sync)"}`);
  console.log(`  Campana local:           id=${localCamp.id}`);
  console.log(`  Campana en Listmonk:     id=${camp.data.providerCampaignId}`);
  console.log(`  Estado:                  ${localCamp.status}`);
  console.log(`  Enviar en:               ${sendAt.toISOString()}`);
  console.log(`  Modo:                    ${localCamp.dispatchMode}`);
  console.log(`\n${colors.yellow}Verificar en Listmonk:${colors.reset}`);
  console.log(`  Panel:    http://192.168.100.21:9000/admin`);
  console.log(`  Login:    chateam_admin / ChatEAM_Listmonk_2026!`);
  console.log(`  Lista:    http://192.168.100.21:9000/admin/lists/${contactList.providerListId}`);
  console.log(`  Campana:  http://192.168.100.21:9000/admin/campaigns/${camp.data.providerCampaignId}`);
  console.log(`\n${colors.gray}Recordar: PM2 NO se ha reiniciado todavia. La UI seguira mostrando el codigo viejo${colors.reset}`);
  console.log(`${colors.gray}hasta que ejecutes: pm2 restart node-1 node-2 chateam-worker${colors.reset}\n`);

  process.exit(0);
};

main().catch(err => {
  console.error(`\n${colors.red}✗ Error fatal:${colors.reset}`);
  console.error(err);
  process.exit(1);
});
