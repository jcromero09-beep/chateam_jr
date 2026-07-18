/**
 * Debug del EmailDashboardService — prueba directamente los métodos del service
 * sin pasar por HTTP. Usa la company y datos del debug-email-marketing.ts previo.
 */
import "dotenv/config";
import "../database";

import EmailDashboardService from "../services/EmailMarketing/EmailDashboardService";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m"
};

function header(t: string): void {
  console.log(`\n${colors.cyan}━━━ ${t} ${"━".repeat(60 - t.length)}${colors.reset}`);
}

const main = async (): Promise<void> => {
  const companyId = parseInt(process.argv[2] || "1", 10);

  console.log(`\n${colors.blue}╔════════════════════════════════════════════════════════╗`);
  console.log(`║  Debug EmailDashboardService — companyId=${companyId}              ║`);
  console.log(`╚════════════════════════════════════════════════════════╝${colors.reset}`);

  // -------- 1. Sync con Listmonk --------
  header("1. Sync con Listmonk");
  const syncResult = await EmailDashboardService.syncFromProvider(companyId);
  console.log(`  Synced:  ${syncResult.synced}`);
  console.log(`  Updated: ${syncResult.updated}`);
  if (syncResult.errors.length > 0) {
    console.log(`  Errors:  ${JSON.stringify(syncResult.errors, null, 2)}`);
  }

  // -------- 2. KPIs por periodo --------
  for (const period of ["today", "week", "month", "year", "all"] as const) {
    header(`2. KPIs periodo=${period}`);
    const kpis = await EmailDashboardService.getKpis(companyId, period);
    console.log(`  Campañas: total=${kpis.campaigns.total} ` +
      `drafts=${kpis.campaigns.drafts} scheduled=${kpis.campaigns.scheduled} ` +
      `running=${kpis.campaigns.running} finished=${kpis.campaigns.finished} ` +
      `cancelled=${kpis.campaigns.cancelled}`);
    console.log(`  Recipients: total=${kpis.recipients.total} ` +
      `pending=${kpis.recipients.pending} sent=${kpis.recipients.sent} ` +
      `delivered=${kpis.recipients.delivered} opened=${kpis.recipients.opened} ` +
      `clicked=${kpis.recipients.clicked} bounced=${kpis.recipients.bounced} ` +
      `failed=${kpis.recipients.failed}`);
    console.log(`  Rates: delivery=${kpis.rates.deliveryRate}% open=${kpis.rates.openRate}% ` +
      `click=${kpis.rates.clickRate}% bounce=${kpis.rates.bounceRate}% ` +
      `failure=${kpis.rates.failureRate}%`);
    console.log(`  Domains: gmail=${kpis.domains.gmail.sent}/${kpis.domains.gmail.failed} ` +
      `outlook=${kpis.domains.outlook.sent}/${kpis.domains.outlook.failed} ` +
      `yahoo=${kpis.domains.yahoo.sent}/${kpis.domains.yahoo.failed} ` +
      `hotmail=${kpis.domains.hotmail.sent}/${kpis.domains.hotmail.failed} ` +
      `other=${kpis.domains.other.sent}/${kpis.domains.other.failed}`);
  }

  // -------- 3. Trend del mes con granularidad day --------
  header("3. Trend (period=month, granularity=day)");
  const trend = await EmailDashboardService.getTrend(companyId, "month", "day");
  console.log(`  Buckets: ${trend.length}`);
  for (const t of trend) {
    console.log(`  ${t.bucket.slice(0, 10)}: sent=${t.sent} ` +
      `delivered=${t.delivered} opened=${t.opened} clicked=${t.clicked} ` +
      `bounced=${t.bounced} failed=${t.failed}`);
  }

  // -------- 4. Campañas (lista) --------
  header("4. Campañas (todas)");
  const camps = await EmailDashboardService.listCampaigns(companyId, {
    period: "all",
    pageNumber: 1,
    pageSize: 10
  });
  console.log(`  Total: ${camps.count}, hasMore=${camps.hasMore}`);
  for (const c of camps.records) {
    console.log(`  [${c.id}] ${c.name.slice(0, 45)}`);
    console.log(`        status=${c.status} provider=${c.provider} mode=${c.dispatchMode}`);
    console.log(`        recipients=${c.totalRecipients} sent=${c.totalSent} ` +
      `delivered=${c.totalDelivered} opened=${c.totalOpened} ` +
      `bounced=${c.totalBounced} failed=${c.totalFailed}`);
    console.log(`        list="${c.contactListName}"`);
  }

  // -------- 5. Fallidos --------
  header("5. Recipients fallidos (bounced/failed)");
  const failures = await EmailDashboardService.listFailures(companyId, {
    period: "all",
    limit: 20
  });
  console.log(`  Total fallidos: ${failures.length}`);
  for (const f of failures) {
    console.log(`  ${f.email} (camp ${f.campaignId}: ${f.campaignName})`);
    console.log(`    status=${f.status} error="${f.errorMessage || ""}" reason="${f.bounceReason || ""}"`);
  }

  console.log(`\n${colors.green}✓ Debug dashboard completado${colors.reset}\n`);
  process.exit(0);
};

main().catch(err => {
  console.error(`\n${colors.yellow}✗ Error fatal:${colors.reset}`);
  console.error(err);
  process.exit(1);
});
