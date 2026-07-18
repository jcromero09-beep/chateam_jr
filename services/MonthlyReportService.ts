/**
 * [Fase2·Ola F · F4.1] Informe mensual de cierre (gasto, CPA, ROAS, top creatividades)
 * exportable a PDF. Los números salen de RoasService (reales, honestos: null si no hay
 * datos). El PDF se genera con google-chrome headless — cero dependencias npm nuevas.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { getRoasByCampaign } from "./MetaMarketingService/RoasService";
import Company from "../models/Company";
import logger from "../utils/logger";

const execFileP = promisify(execFile);
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";

const money = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-EC"));
const roasFmt = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}x`);
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const periodRange = (period: string): { since: string; until: string; label: string } => {
  const [y, m] = period.split("-").map(Number);
  const since = `${period}-01`;
  const until = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  // timeZone UTC obligatorio: sin él, toLocaleDateString convierte a hora local
  // (Ecuador UTC-5) y 2026-07-01 se muestra como "junio" (30/06 19:00). Bug de fecha.
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-EC", { month: "long", year: "numeric", timeZone: "UTC" });
  return { since, until, label };
};

export const buildReportHtml = async (companyId: number, period: string): Promise<string> => {
  const { since, until, label } = periodRange(period);
  const company = await Company.findByPk(companyId);
  const { rows, overview } = await getRoasByCampaign({ companyId, since, until });

  const withData = rows.filter(r => r.dataStatus === "ok");
  const topByRoas = [...withData].filter(r => r.roas != null).sort((a, b) => (b.roas! - a.roas!)).slice(0, 5);
  const bestCpa = [...withData].filter(r => r.cpa != null).sort((a, b) => a.cpa! - b.cpa!)[0];

  // Aprendizajes automáticos honestos (sin inventar): se derivan de los datos.
  const learnings: string[] = [];
  if (overview.averageRoas != null) {
    learnings.push(overview.averageRoas >= 1
      ? `El ROAS medio del mes fue ${roasFmt(overview.averageRoas)}: la inversión se recuperó.`
      : `El ROAS medio fue ${roasFmt(overview.averageRoas)} (<1x): el mes no recuperó la inversión, revisar segmentación.`);
  }
  if (bestCpa) learnings.push(`El CPA más bajo lo logró "${bestCpa.campaignName || bestCpa.campaignId}" con ${money(bestCpa.cpa)}.`);
  const noData = rows.filter(r => r.dataStatus !== "ok").length;
  if (noData) learnings.push(`${noData} campaña(s) sin datos suficientes para medir: aún no concluyentes.`);
  if (!learnings.length) learnings.push("Sin datos de campañas en el período: no hay aprendizajes que reportar todavía.");

  const rowsHtml = rows.map(r => `
    <tr>
      <td>${esc(r.campaignName || r.campaignId)}</td>
      <td class="r">${money(r.spend)}</td>
      <td class="r">${money(r.revenue)}</td>
      <td class="r">${num(r.conversions)}</td>
      <td class="r">${r.cpa == null ? "—" : money(r.cpa)}</td>
      <td class="r">${roasFmt(r.roas)}</td>
      <td class="s ${r.dataStatus}">${r.dataStatus === "ok" ? "OK" : r.dataStatus === "no_spend" ? "sin gasto" : "insuficiente"}</td>
    </tr>`).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0e2a30; margin: 32px; font-size: 13px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .sub { color: #54656a; margin-bottom: 24px; }
    .kpis { display: flex; gap: 16px; margin-bottom: 24px; }
    .kpi { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
    .kpi .l { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .kpi .v { font-size: 22px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #eef1f2; }
    th { font-size: 11px; text-transform: uppercase; color: #64748b; }
    td.r { text-align: right; font-variant-numeric: tabular-nums; }
    td.s { font-size: 11px; } td.s.ok { color: #16a34a; } td.s.insufficient { color: #b45309; } td.s.no_spend { color: #64748b; }
    h2 { font-size: 15px; margin: 28px 0 8px; }
    ul { margin: 0; padding-left: 18px; } li { margin: 4px 0; }
    .foot { margin-top: 32px; color: #94a3b8; font-size: 10px; border-top: 1px solid #eef1f2; padding-top: 8px; }
  </style></head><body>
    <h1>Informe de cierre — ${esc(company?.name || "")}</h1>
    <div class="sub">${esc(label)} · ${since} a ${until}</div>
    <div class="kpis">
      <div class="kpi"><div class="l">Gasto</div><div class="v">${money(overview.totalSpend)}</div></div>
      <div class="kpi"><div class="l">Ingresos atribuidos</div><div class="v">${money(overview.totalRevenue)}</div></div>
      <div class="kpi"><div class="l">Conversiones</div><div class="v">${num(overview.totalConversions)}</div></div>
      <div class="kpi"><div class="l">ROAS medio</div><div class="v">${roasFmt(overview.averageRoas)}</div></div>
    </div>
    <h2>Desglose por campaña</h2>
    <table><thead><tr><th>Campaña</th><th class="r">Gasto</th><th class="r">Ingresos</th><th class="r">Conv.</th><th class="r">CPA</th><th class="r">ROAS</th><th>Datos</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="7" style="color:#94a3b8">Sin campañas en el período.</td></tr>'}</tbody></table>
    <h2>Top creatividades por ROAS</h2>
    <ul>${topByRoas.length ? topByRoas.map(r => `<li>${esc(r.campaignName || r.campaignId)} — ${roasFmt(r.roas)} (${money(r.spend)} de gasto)</li>`).join("") : "<li>Sin datos suficientes.</li>"}</ul>
    <h2>Aprendizajes</h2>
    <ul>${learnings.map(l => `<li>${esc(l)}</li>`).join("")}</ul>
    <div class="foot">Generado por Chateam · datos reales de InsightsDaily + atribución. "—" = sin dato, no cero inventado.</div>
  </body></html>`;
};

/** Renderiza el HTML a PDF con google-chrome headless (sin deps npm). */
export const buildReportPdf = async (companyId: number, period: string): Promise<Buffer> => {
  const html = await buildReportHtml(companyId, period);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chateam-report-"));
  const htmlPath = path.join(dir, "report.html");
  const pdfPath = path.join(dir, "report.pdf");
  fs.writeFileSync(htmlPath, html);
  try {
    await execFileP(CHROME, [
      "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`
    ], { timeout: 30000 });
    const pdf = fs.readFileSync(pdfPath);
    logger.info(`[MonthlyReport] PDF generado company=${companyId} period=${period} bytes=${pdf.length}`);
    return pdf;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

export default { buildReportHtml, buildReportPdf };
