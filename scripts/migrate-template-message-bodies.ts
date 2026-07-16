/**
 * Migración: renderizar el texto real en mensajes de plantilla históricos.
 *
 * Problema: los mensajes de plantilla WhatsApp (HSM) se guardaron con el body
 * placeholder `[Plantilla: <nombre>]` en vez del texto real. Este script busca
 * esos mensajes y reescribe su `body` usando `renderTemplateBody(template, params)`
 * — la MISMA función que ahora usa el envío en vivo — reconstruyendo el texto a
 * partir de la plantilla (`WhatsAppTemplate.bodyContent`) y los `params` guardados
 * en `Message.dataJson`.
 *
 * SEGURIDAD (BD sagrada):
 *   - DRY-RUN por defecto: sin `--apply` NO escribe nada, solo reporta.
 *   - Solo toca `body` (fields: ['body']) y con `silent: true` → NO altera
 *     `updatedAt`, así no reordena tickets ni cambia históricos de fecha.
 *   - Si no puede reconstruir el texto (plantilla no encontrada, sin bodyContent,
 *     o faltan params y quedarían {{n}} sin resolver) → SALTA el mensaje intacto.
 *   - Idempotente: al reescribir, el body deja de empezar con "[Plantilla:", así
 *     que una segunda corrida ya no lo vuelve a tomar.
 *
 * Uso:
 *   # Previsualizar TODO (no escribe):
 *   npx tsx scripts/migrate-template-message-bodies.ts
 *
 *   # Previsualizar una company:
 *   npx tsx scripts/migrate-template-message-bodies.ts --company=8
 *
 *   # Aplicar de verdad (una company recomendado primero):
 *   npx tsx scripts/migrate-template-message-bodies.ts --company=8 --apply
 *
 *   # Aplicar a todo:
 *   npx tsx scripts/migrate-template-message-bodies.ts --apply
 *
 * Flags:
 *   --apply            Escribe los cambios (por defecto: dry-run).
 *   --company=<id>     Filtra por companyId.
 *   --limit=<n>        Máximo de mensajes a procesar.
 *   --batch=<n>        Tamaño de página (default 500).
 *   --samples=<n>      Cuántos ejemplos de diff imprimir (default 15).
 *   --allow-partial    Reescribe aunque queden {{n}} sin resolver (default: salta).
 *   --verbose          Imprime cada cambio/omisión.
 */

import "dotenv/config";
import "../database";

import { writeFileSync } from "fs";
import { Op } from "sequelize";
import Message from "../models/Message";
import WhatsAppTemplate from "../models/WhatsAppTemplate";
import { renderTemplateBody } from "../services/MetaServices/metaSendService";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (!hit) return undefined;
    const eq = hit.indexOf("=");
    return eq === -1 ? "true" : hit.slice(eq + 1);
  };
  const num = (name: string): number | undefined => {
    const v = get(name);
    if (v === undefined) return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    apply: get("apply") === "true",
    companyId: num("company"),
    limit: num("limit"),
    batch: num("batch") ?? 500,
    samples: num("samples") ?? 15,
    backup: get("backup"), // ruta de archivo JSON; si se define, se respalda antes de aplicar
    allowPartial: get("allow-partial") === "true",
    verbose: get("verbose") === "true",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function safeParseJson(raw: unknown): any {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Extrae el nombre de plantilla del placeholder `[Plantilla: <nombre>]`. */
function extractNameFromBody(body: string): string | null {
  const m = body.match(/^\[Plantilla:\s*([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

/**
 * Fallback: si dataJson no trae params, intenta leerlos del propio placeholder
 * (`[Plantilla: name]\n📋 Parámetros: p1, p2` o `[Plantilla: name]\np1, p2`).
 * Es best-effort; split por ", " (no fiable si un param contiene comas).
 */
function extractParamsFromBody(body: string): string[] {
  const afterBracket = body.replace(/^\[Plantilla:[^\]]*\]/, "").trim();
  if (!afterBracket) return [];
  const cleaned = afterBracket.replace(/^📋\s*Par[aá]metros:\s*/i, "").trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const hasUnresolvedVars = (text: string): boolean => /\{\{\s*\d+\s*\}\}/.test(text);
const isPlaceholder = (text: string): boolean => /^\[Plantilla:/.test(text.trim());

const truncate = (s: string, n = 90): string => {
  const oneLine = s.replace(/\n/g, "⏎");
  return oneLine.length > n ? oneLine.slice(0, n) + "…" : oneLine;
};

// Cache de plantillas: evita reconsultar la misma plantilla por cada mensaje.
const templateCache = new Map<string, WhatsAppTemplate | null>();

async function loadTemplate(
  companyId: number,
  templateId: number | undefined,
  templateName: string | null,
): Promise<WhatsAppTemplate | null> {
  const keyId = templateId ? `c${companyId}:id:${templateId}` : null;
  const keyName = templateName ? `c${companyId}:nm:${templateName.toLowerCase()}` : null;

  if (keyId && templateCache.has(keyId)) return templateCache.get(keyId)!;
  if (keyName && templateCache.has(keyName)) return templateCache.get(keyName)!;

  let tpl: WhatsAppTemplate | null = null;
  if (templateId) {
    tpl = await WhatsAppTemplate.findOne({ where: { id: templateId, companyId } });
  }
  if (!tpl && templateName) {
    tpl = await WhatsAppTemplate.findOne({ where: { name: templateName, companyId } });
  }

  if (keyId) templateCache.set(keyId, tpl);
  if (keyName) templateCache.set(keyName, tpl);
  return tpl;
}

type SkipReason =
  | "template_not_found"
  | "cannot_render"     // sin bodyContent → renderTemplateBody devuelve placeholder
  | "incomplete_params" // quedan {{n}} sin resolver y no se permite parcial
  | "no_change";        // el render coincide con el body actual

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs();

  console.log("========================================================");
  console.log(" Migración de bodies de mensajes de plantilla");
  console.log("========================================================");
  console.log(`  Modo:        ${args.apply ? "⚠️  APPLY (escribe en BD)" : "🔍 DRY-RUN (solo lectura)"}`);
  console.log(`  DB destino:  ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "?"} (user=${process.env.DB_USER || "?"})`);
  console.log(`  Company:     ${args.companyId ?? "TODAS"}`);
  console.log(`  Límite:      ${args.limit ?? "sin límite"}`);
  console.log(`  Batch:       ${args.batch}`);
  console.log(`  Partial:     ${args.allowPartial ? "sí (reescribe con {{n}})" : "no (salta incompletos)"}`);
  console.log("--------------------------------------------------------");

  const baseWhere: any = { body: { [Op.like]: "[Plantilla:%" } };
  if (args.companyId) baseWhere.companyId = args.companyId;

  const total = await Message.count({ where: baseWhere });
  console.log(`  Candidatos (body LIKE '[Plantilla:%'): ${total}`);
  if (total === 0) {
    console.log("  Nada que migrar. Fin.");
    process.exit(0);
  }
  console.log("--------------------------------------------------------");

  const stats = {
    scanned: 0,
    updated: 0,
    errors: 0,
    skipped: { template_not_found: 0, cannot_render: 0, incomplete_params: 0, no_change: 0 } as Record<SkipReason, number>,
  };
  const samples: Array<{ id: number; from: string; to: string }> = [];
  // Candidatos a reescribir (con body original y nuevo completos, para respaldo).
  const candidates: Array<{ id: number; companyId: number; from: string; to: string }> = [];

  let lastId = 0;
  let stop = false;

  while (!stop) {
    const rows = await Message.findAll({
      where: { ...baseWhere, id: { [Op.gt]: lastId } },
      order: [["id", "ASC"]],
      limit: args.batch,
      attributes: ["id", "body", "dataJson", "companyId"],
    });
    if (rows.length === 0) break;

    for (const msg of rows) {
      lastId = msg.id;
      stats.scanned++;

      if (args.limit && stats.scanned > args.limit) {
        stop = true;
        stats.scanned--; // este no se procesó
        break;
      }

      const body = msg.body || "";
      const data = safeParseJson(msg.dataJson);

      const templateId: number | undefined =
        typeof data?.templateId === "number" ? data.templateId : undefined;
      const templateName: string | null =
        (typeof data?.templateName === "string" && data.templateName) || extractNameFromBody(body);

      const params: string[] = Array.isArray(data?.params) ? data.params : extractParamsFromBody(body);

      const tpl = await loadTemplate(msg.companyId, templateId, templateName);
      if (!tpl) {
        stats.skipped.template_not_found++;
        if (args.verbose) console.log(`  · skip[template_not_found] id=${msg.id} name=${templateName ?? "?"}`);
        continue;
      }

      const rendered = renderTemplateBody(tpl, params);

      if (!rendered || isPlaceholder(rendered)) {
        stats.skipped.cannot_render++;
        if (args.verbose) console.log(`  · skip[cannot_render] id=${msg.id}`);
        continue;
      }
      if (hasUnresolvedVars(rendered) && !args.allowPartial) {
        stats.skipped.incomplete_params++;
        if (args.verbose) console.log(`  · skip[incomplete_params] id=${msg.id} -> "${truncate(rendered)}"`);
        continue;
      }
      if (rendered === body) {
        stats.skipped.no_change++;
        continue;
      }

      // Candidato válido. NO escribimos aún: primero recolectamos todo (para poder
      // respaldar el estado original completo antes de tocar la BD).
      candidates.push({ id: msg.id, companyId: msg.companyId, from: body, to: rendered });
      if (samples.length < args.samples) {
        samples.push({ id: msg.id, from: truncate(body), to: truncate(rendered) });
      }
      if (args.verbose) console.log(`  · candidato id=${msg.id}: "${truncate(body)}" -> "${truncate(rendered)}"`);
    }

    console.log(`  ...procesados ${stats.scanned}/${total} (últimos id=${lastId})`);
  }

  stats.updated = candidates.length; // en dry-run: "se actualizarían"; en apply se recalcula abajo

  // -------------------------------------------------------------------------
  // Reporte
  // -------------------------------------------------------------------------
  console.log("--------------------------------------------------------");
  console.log("  Ejemplos (antes → después):");
  if (samples.length === 0) {
    console.log("    (ninguno)");
  } else {
    for (const s of samples) {
      console.log(`    #${s.id}`);
      console.log(`      - ${s.from}`);
      console.log(`      + ${s.to}`);
    }
  }
  console.log("--------------------------------------------------------");
  console.log("  RESUMEN");
  console.log(`    Escaneados:              ${stats.scanned}`);
  console.log(`    Candidatos a actualizar: ${stats.updated}`);
  console.log(`    Saltados (total):        ${
    stats.skipped.template_not_found +
    stats.skipped.cannot_render +
    stats.skipped.incomplete_params +
    stats.skipped.no_change
  }`);
  console.log(`       - plantilla no encontrada: ${stats.skipped.template_not_found}`);
  console.log(`       - sin bodyContent:         ${stats.skipped.cannot_render}`);
  console.log(`       - params incompletos:      ${stats.skipped.incomplete_params}`);
  console.log(`       - sin cambios:             ${stats.skipped.no_change}`);
  console.log("--------------------------------------------------------");

  if (!args.apply) {
    console.log("  🔍 DRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar.");
    console.log("========================================================");
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // APPLY: respaldo -> escritura
  // -------------------------------------------------------------------------
  if (candidates.length === 0) {
    console.log("  Nada para aplicar.");
    console.log("========================================================");
    process.exit(0);
  }

  // 1) Respaldo COMPLETO antes de tocar la BD (reversible).
  if (args.backup) {
    const payload = {
      generatedAt: new Date().toISOString(),
      db: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
      companyId: args.companyId ?? null,
      count: candidates.length,
      note: "Respaldo de body original de mensajes de plantilla antes de la migración. Para revertir: UPDATE \"Messages\" SET body=<from> WHERE id=<id>.",
      rows: candidates.map((c) => ({ id: c.id, companyId: c.companyId, from: c.from, to: c.to })),
    };
    try {
      writeFileSync(args.backup, JSON.stringify(payload, null, 2), "utf8");
      console.log(`  💾 Respaldo escrito: ${args.backup} (${candidates.length} filas)`);
    } catch (err: any) {
      console.error(`  ✖ No se pudo escribir el respaldo (${args.backup}): ${err?.message || err}`);
      console.error("  Abortando APPLY para no escribir sin respaldo.");
      process.exit(1);
    }
  } else {
    console.log("  ⚠️  APPLY sin --backup (no se generó respaldo).");
  }

  // 2) Escritura: solo 'body', silent (no toca updatedAt).
  console.log(`  Aplicando ${candidates.length} actualizaciones...`);
  stats.updated = 0;
  for (const c of candidates) {
    try {
      await Message.update(
        { body: c.to },
        { where: { id: c.id }, fields: ["body"], silent: true },
      );
      stats.updated++;
      if (stats.updated % 200 === 0) console.log(`    ...${stats.updated}/${candidates.length}`);
    } catch (err: any) {
      stats.errors++;
      console.error(`  ✖ error actualizando id=${c.id}: ${err?.message || err}`);
    }
  }

  console.log("--------------------------------------------------------");
  console.log(`  ✅ APPLY completado. Actualizados: ${stats.updated} | Errores: ${stats.errors}`);
  console.log("========================================================");

  process.exit(0);
}

main().catch((err) => {
  console.error("✖ Error fatal en la migración:", err);
  process.exit(1);
});
