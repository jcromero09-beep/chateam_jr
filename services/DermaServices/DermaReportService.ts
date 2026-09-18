/**
 * DermaReportService — informe del análisis para el paciente: HTML imprimible
 * y PDF (HTML → Chrome headless, mismo mecanismo que MonthlyReportService).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import Company from "../../models/Company";
import DermaAnalysis from "../../models/DermaAnalysis";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { ShowDermaAnalysisService } from "./DermaAnalysisServices";

const execFileP = promisify(execFile);
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

const scoreColor = (score: number | null): string => {
  if (score === null) return "#94a3b8";
  if (score >= 85) return "#16a34a";
  if (score >= 70) return "#65a30d";
  if (score >= 45) return "#d97706";
  return "#dc2626";
};

const severityLabel = (s: string | null): string => {
  switch (s) {
    case "ninguna":
      return "Sin hallazgos";
    case "leve":
      return "Leve";
    case "moderada":
      return "Moderada";
    case "alta":
      return "Alta";
    default:
      return "—";
  }
};

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("es-EC", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
};

const imageDataUri = (analysis: DermaAnalysis): string | null => {
  if (!analysis.imagePath || !fs.existsSync(analysis.imagePath)) return null;
  try {
    const buf = fs.readFileSync(analysis.imagePath);
    return `data:${analysis.imageMimeType || "image/jpeg"};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
};

export const buildDermaReportHtml = async (
  companyId: number,
  analysisId: number,
): Promise<string> => {
  const analysis = await ShowDermaAnalysisService(companyId, analysisId);
  if (analysis.status !== "completed" || !analysis.result) {
    throw new AppError(
      "El análisis no está completado; no se puede generar el informe.",
      409,
    );
  }
  const company = await Company.findByPk(companyId, {
    attributes: ["id", "name"],
  }).catch(() => null);
  const patient: any = (analysis as any).patient || {};
  const r = analysis.result;
  const img = imageDataUri(analysis);

  const metricRows = r.metrics
    .map((m) => {
      const score = m.score;
      const bar =
        score === null
          ? `<span class="value">${esc(m.value || "—")}</span>`
          : `<div class="bar"><div class="fill" style="width:${score}%;background:${scoreColor(score)}"></div></div><span class="num" style="color:${scoreColor(score)}">${score}</span>`;
      return `
      <tr>
        <td class="metric">${esc(m.label)}</td>
        <td class="score">${bar}</td>
        <td class="sev">${esc(severityLabel(m.severity))}</td>
        <td class="text">${esc(m.findings)}${m.zones?.length ? `<div class="zones">Zonas: ${esc(m.zones.join(", "))}</div>` : ""}</td>
        <td class="text">${esc(m.recommendation)}</td>
      </tr>`;
    })
    .join("");

  const recs = r.recommendations
    .map(
      (rec) =>
        `<li><span class="prio prio-${esc(rec.priority)}">${esc(rec.priority)}</span><strong>${esc(rec.title)}</strong> ${esc(rec.detail)}</li>`,
    )
    .join("");

  const c = r.clinicalDetail;
  const clinicalBlock = c
    ? `
    <section class="block">
      <h2>Detalle clínico</h2>
      ${c.observations ? `<p>${esc(c.observations)}</p>` : ""}
      ${
        c.suggestedTreatments.length
          ? `<h3>Tratamientos sugeridos</h3><ul>${c.suggestedTreatments
              .map(
                (t) =>
                  `<li><strong>${esc(t.name)}</strong>${t.sessions ? ` · ${esc(t.sessions)}` : ""}<br>${esc(t.rationale)}</li>`,
              )
              .join("")}</ul>`
          : ""
      }
      ${
        c.homeCare.morning.length || c.homeCare.night.length
          ? `
      <h3>Rutina en casa</h3>
      <div class="cols">
        <div><h4>Mañana</h4><ol>${c.homeCare.morning.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>
        <div><h4>Noche</h4><ol>${c.homeCare.night.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>
      </div>`
          : ""
      }
      ${c.cautions.length ? `<h3>Precauciones</h3><ul>${c.cautions.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      ${c.followUpWeeks ? `<p><strong>Revisión sugerida:</strong> en ${c.followUpWeeks} semanas.</p>` : ""}
    </section>`
    : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Informe de análisis facial · ${esc(patient.name || "Paciente")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 28px 32px; font-size: 12px; line-height: 1.45; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #6d5dfc; padding-bottom: 12px; margin-bottom: 18px; }
  header h1 { margin: 0; font-size: 20px; letter-spacing: .02em; }
  header .sub { color: #64748b; font-size: 11px; margin-top: 2px; }
  header .meta { text-align: right; color: #475569; font-size: 11px; }
  .top { display: grid; grid-template-columns: 220px 1fr; gap: 20px; margin-bottom: 18px; }
  .photo { width: 220px; height: 260px; border-radius: 12px; object-fit: cover; border: 1px solid #e2e8f0; background: #f1f5f9; }
  .scorecard { display: flex; gap: 18px; align-items: center; margin-bottom: 12px; }
  .ring { width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center; font-size: 30px; font-weight: 700; color: #fff; }
  .kpis { display: grid; grid-template-columns: repeat(3, auto); gap: 10px 18px; }
  .kpi .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  .kpi .val { font-size: 14px; font-weight: 600; }
  .summary { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 10px; padding: 10px 12px; }
  h2 { font-size: 14px; margin: 18px 0 8px; color: #4c1d95; }
  h3 { font-size: 12px; margin: 12px 0 4px; }
  h4 { font-size: 11px; margin: 6px 0 2px; color: #475569; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 6px 6px; }
  td { border-bottom: 1px solid #f1f5f9; padding: 6px 6px; vertical-align: top; }
  td.metric { font-weight: 600; white-space: nowrap; }
  td.score { width: 120px; }
  .bar { display: inline-block; width: 78px; height: 8px; border-radius: 4px; background: #e2e8f0; vertical-align: middle; overflow: hidden; }
  .fill { height: 100%; border-radius: 4px; }
  .num { display: inline-block; margin-left: 6px; font-weight: 700; }
  .zones { color: #64748b; font-size: 10px; margin-top: 2px; }
  td.sev { white-space: nowrap; }
  ul, ol { margin: 4px 0 0 16px; padding: 0; }
  li { margin-bottom: 4px; }
  .prio { display: inline-block; font-size: 9px; text-transform: uppercase; padding: 1px 6px; border-radius: 999px; margin-right: 6px; color: #fff; }
  .prio-alta { background: #dc2626; } .prio-media { background: #d97706; } .prio-baja { background: #16a34a; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .block { break-inside: avoid; }
  .warn { margin-top: 8px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; padding: 6px 10px; border-radius: 8px; }
  footer { margin-top: 22px; border-top: 1px solid #e2e8f0; padding-top: 8px; color: #94a3b8; font-size: 9.5px; }
  @page { size: A4; margin: 12mm; }
</style></head>
<body>
<header>
  <div>
    <h1>Informe de análisis facial</h1>
    <div class="sub">${esc(company?.name || "")}</div>
  </div>
  <div class="meta">
    <div><strong>${esc(patient.name || "Paciente")}</strong>${patient.age != null ? ` · ${patient.age} años` : ""}</div>
    <div>Fecha: ${fmtDate(analysis.createdAt)} · Análisis #${analysis.id}</div>
    <div>Profesional: ${esc((analysis as any).user?.name || "—")}</div>
  </div>
</header>

<div class="top">
  ${img ? `<img class="photo" src="${img}" alt="Foto analizada">` : `<div class="photo"></div>`}
  <div>
    <div class="scorecard">
      <div class="ring" style="background:${scoreColor(r.globalScore)}">${r.globalScore}</div>
      <div class="kpis">
        <div class="kpi"><div class="label">Score global</div><div class="val">${r.globalScore} / 100</div></div>
        <div class="kpi"><div class="label">Tipo de piel</div><div class="val">${esc(r.skinType)}</div></div>
        <div class="kpi"><div class="label">Edad de piel</div><div class="val">${r.skinAge ?? "—"}</div></div>
        <div class="kpi"><div class="label">Métricas</div><div class="val">${r.metrics.length}</div></div>
        <div class="kpi"><div class="label">Estado</div><div class="val">Completado</div></div>
        <div class="kpi"><div class="label">Detalle clínico</div><div class="val">${analysis.clinicalDetail ? "Sí" : "No"}</div></div>
      </div>
    </div>
    <div class="summary">${esc(r.summary || "Sin resumen.")}</div>
    ${!r.imageQuality.ok ? `<div class="warn">Calidad de la foto limitada: ${esc(r.imageQuality.notes)}</div>` : ""}
  </div>
</div>

<h2>Resultados por métrica</h2>
<table>
  <thead><tr><th>Métrica</th><th>Score</th><th>Severidad</th><th>Hallazgos</th><th>Recomendación</th></tr></thead>
  <tbody>${metricRows}</tbody>
</table>

${recs ? `<section class="block"><h2>Plan recomendado</h2><ul>${recs}</ul></section>` : ""}
${clinicalBlock}

<footer>
  Valoración estética asistida por IA para apoyo del profesional. No constituye diagnóstico médico ni sustituye la
  consulta con un dermatólogo. Generado el ${fmtDate(new Date())}.
</footer>
</body></html>`;
};

export const buildDermaReportPdf = async (
  companyId: number,
  analysisId: number,
): Promise<Buffer> => {
  const html = await buildDermaReportHtml(companyId, analysisId);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chateam-derma-"));
  const htmlPath = path.join(dir, "report.html");
  const pdfPath = path.join(dir, "report.pdf");
  fs.writeFileSync(htmlPath, html);
  try {
    await execFileP(
      CHROME,
      [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--no-pdf-header-footer",
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ],
      { timeout: 45000 },
    );
    const pdf = fs.readFileSync(pdfPath);
    logger.info(
      `[DermaReport] PDF generado company=${companyId} analysis=${analysisId} bytes=${pdf.length}`,
    );
    return pdf;
  } catch (err: any) {
    logger.error(
      `[DermaReport] Fallo generando PDF (${CHROME}): ${err.message}`,
    );
    throw new AppError(
      "No se pudo generar el PDF (Chrome headless no disponible). Usa la vista HTML del informe o configura CHROME_BIN.",
      500,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

export default { buildDermaReportHtml, buildDermaReportPdf };
