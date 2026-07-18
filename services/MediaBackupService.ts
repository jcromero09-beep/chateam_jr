/**
 * MediaBackupService.ts
 * ------------------------------------------------------------------
 * Servicio mensual de backup, envío por correo y limpieza de
 * multimedia de tickets para ChatEAM JR.
 *
 * Flujo principal (NO usa Google Drive):
 *   1. Escanea  public/company{id}/  (NO solo /chat) excluyendo carpetas
 *      reservadas (quickMessage, flowbuilder, schedule, campaign,
 *      emailCampaign, receipts, contacts, logos, backup_logs).
 *   2. Conserva archivos modificados en los últimos N días (default 30).
 *   3. Comprime archivos viejos en ZIP en /tmp.
 *   4. Valida ZIP (existe, tamaño > min, entries == seleccionados).
 *   5. Genera manifest JSON con metadata y lo incluye dentro del ZIP.
 *   6. Envía ZIP por Listmonk (/api/tx multipart) al correo de la company.
 *   7. Borra archivos originales viejos SOLO si ZIP es válido.
 *   8. Borra ZIP local SOLO si envío fue exitoso.
 *
 * Reglas inamovibles:
 *  - BD SAGRADA: nunca toca DB de mensajes/tickets.
 *  - Path traversal blindado a public/company{id}.
 *  - Lock por company en /tmp para evitar doble ejecución.
 *  - Si un archivo desaparece durante el proceso → warn y continúa.
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import archiver from "archiver";
import CompaniesSettings from "../models/CompaniesSettings";
import Company from "../models/Company";
import logger, { logError, logInfo, logWarn } from "../utils/logger";
import ProviderFactory from "./EmailMarketing/providers/ProviderFactory";
import EmailProviderConfig from "../models/EmailMarketing/EmailProviderConfig";

// ────────────────────────────────────────────────────────────────────
// Tipos públicos
// ────────────────────────────────────────────────────────────────────

export interface MediaBackupOptions {
  retentionDays?: number;
  dryRun?: boolean;
}

export interface ManifestEntry {
  relativePath: string;
  size: number;
  mtime: string;
  sha256?: string;
}

export interface BackupManifest {
  companyId: number;
  companyName: string | null;
  generatedAt: string;
  retentionDays: number;
  cutoff: string;
  totalFiles: number;
  totalBytes: number;
  zipPath: string;
  files: ManifestEntry[];
}

export interface CompanyBackupResult {
  success: boolean;
  companyId: number;
  skipped?: boolean;
  reason?: string;
  dryRun?: boolean;
  totalCandidates?: number;
  totalRecent?: number;
  totalBytesCandidates?: number;
  zipPath?: string;
  zipSize?: number;
  emailSent?: boolean;
  emailError?: string;
  originalsDeleted?: number;
  originalsDeletedBytes?: number;
  zipKept?: boolean;
  error?: string;
}

export interface BulkBackupStats {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  totalBytesFreed: number;
  results: CompanyBackupResult[];
}

export interface BackupStatus {
  enabled: boolean;
  retentionDays: number;
  tmpDir: string;
  maxEmailZipMB: number;
  lastBackupAt: Date | null;
  companyId: number;
}

// ────────────────────────────────────────────────────────────────────
// Constantes / Config
// ────────────────────────────────────────────────────────────────────

const RESERVED_FOLDERS = new Set<string>([
  "backup_logs",
  "quickMessage",
  "flowbuilder",
  "schedule",
  "campaign",
  "emailCampaign",
  "campaigns",
  "email-campaigns",
  "receipts",
  "contacts",
  "logos",
  "logo",
  "announcements",
  "chat", // legacy — el actual no se usa, igual lo dejamos fuera para no doble-comprimir
  "tmp",
  ".cache"
]);

const ALLOWED_EXTENSIONS = new Set<string>([
  // imágenes
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".bmp", ".svg",
  // audio
  ".ogg", ".oga", ".mp3", ".wav", ".m4a", ".opus", ".aac", ".amr",
  // video
  ".mp4", ".mov", ".webm", ".mkv", ".3gp", ".avi",
  // documentos
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".csv", ".txt", ".rtf", ".odt", ".ods", ".odp",
  // adjuntos varios
  ".apk", ".zip", ".rar", ".7z", ".vcf"
]);

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_TMP_DIR = "/tmp";
const DEFAULT_MAX_EMAIL_ZIP_MB = 25;
const DEFAULT_MIN_VALID_ZIP_BYTES = 22; // ZIP vacío tiene 22 bytes (EOCD)

// Concurrencia para operaciones FS pesadas
const FS_CONCURRENCY = 16;

// ────────────────────────────────────────────────────────────────────
// Helpers concurrencia / FS
// ────────────────────────────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = cursor++;
          if (i >= items.length) return;
          results[i] = await worker(items[i]);
        }
      })()
    );
  }
  await Promise.all(workers);
  return results;
}

function envInt(name: string, fallback: number): number {
  const v = parseInt(process.env[name] || "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "true" || v === "1" || v === "yes";
}

// ────────────────────────────────────────────────────────────────────
// MediaBackupService
// ────────────────────────────────────────────────────────────────────

export class MediaBackupService {
  // ╭───────────────────────────── Config ─────────────────────────╮
  get retentionDays(): number {
    return envInt("MEDIA_BACKUP_RETENTION_DAYS", DEFAULT_RETENTION_DAYS);
  }
  get tmpDir(): string {
    return process.env.MEDIA_BACKUP_TMP_DIR || DEFAULT_TMP_DIR;
  }
  get deleteAfterZip(): boolean {
    return envBool("MEDIA_BACKUP_DELETE_AFTER_ZIP", true);
  }
  get deleteZipAfterEmail(): boolean {
    return envBool("MEDIA_BACKUP_DELETE_ZIP_AFTER_EMAIL", true);
  }
  get maxEmailZipMB(): number {
    return envInt("MEDIA_BACKUP_MAX_EMAIL_ZIP_MB", DEFAULT_MAX_EMAIL_ZIP_MB);
  }
  get adminFallbackEmail(): string {
    return process.env.MEDIA_BACKUP_ADMIN_EMAIL || "";
  }

  // ╭───────────────────────── Paths seguros ──────────────────────╮
  private getCompanyDir(companyId: number): string {
    // Resuelve a absoluto y obliga a quedarse dentro de public/companyX
    const publicDir = path.resolve(process.cwd(), "public");
    const target = path.resolve(publicDir, `company${companyId}`);
    if (!target.startsWith(publicDir + path.sep)) {
      throw new Error(`Path traversal detectado: ${target}`);
    }
    return target;
  }

  private isWithinCompany(fullPath: string, companyDir: string): boolean {
    const resolved = path.resolve(fullPath);
    return resolved === companyDir || resolved.startsWith(companyDir + path.sep);
  }

  // ╭───────────────────────── Lock por company ───────────────────╮
  private getLockPath(companyId: number): string {
    return path.join(this.tmpDir, `chateam-media-backup-company${companyId}.lock`);
  }

  /**
   * Lock cooperativo basado en archivo. Si existe y tiene <12h, salta.
   * Devuelve función para liberar.
   */
  private async acquireLock(companyId: number): Promise<{ release: () => Promise<void> } | null> {
    const lockPath = this.getLockPath(companyId);
    try {
      const stat = await fsp.stat(lockPath);
      const ageMs = Date.now() - stat.mtimeMs;
      // Si el lock tiene < 12h consideramos que hay otra ejecución
      if (ageMs < 12 * 60 * 60 * 1000) {
        return null;
      }
      // Stale lock — se sobreescribe
      logWarn("Stale lock detectado, sobreescribiendo", { companyId, ageMs });
    } catch {
      // No existe → todo bien
    }
    await fsp.mkdir(this.tmpDir, { recursive: true });
    await fsp.writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
      { encoding: "utf-8" }
    );
    return {
      release: async () => {
        try {
          await fsp.unlink(lockPath);
        } catch {
          /* ignore */
        }
      }
    };
  }

  // ╭───────────────────────── Logs por company ───────────────────╮
  /**
   * Escribe línea de log unificada:
   * [TIMESTAMP] [LEVEL] message | details
   * Compatible con el parser de getLogs/DriveBackupController.
   */
  private async writeCompanyLog(
    companyId: number,
    level: "INFO" | "WARN" | "ERROR",
    message: string,
    details?: string
  ): Promise<void> {
    try {
      const logDir = path.join(this.getCompanyDir(companyId), "backup_logs");
      await fsp.mkdir(logDir, { recursive: true });
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const fileName = `${y}-${m}_media_backup.log`;
      const logPath = path.join(logDir, fileName);
      const line = `[${now.toISOString()}] [${level}] ${message}${details ? ` | ${details}` : ""}\n`;
      await fsp.appendFile(logPath, line, { encoding: "utf-8" });
    } catch (err) {
      logWarn("Error escribiendo log de media backup", { error: (err as Error).message, companyId });
    }
  }

  /**
   * Lee y devuelve los logs (parseados) de una company.
   */
  async getLogs(companyId: number): Promise<
    Array<{
      filename: string;
      entries: Array<{
        timestamp: string;
        level: string;
        message: string;
        details?: string;
      }>;
    }>
  > {
    try {
      const logDir = path.join(this.getCompanyDir(companyId), "backup_logs");
      const exists = await fsp
        .access(logDir)
        .then(() => true)
        .catch(() => false);
      if (!exists) return [];

      const files = (await fsp.readdir(logDir)).filter(f => f.endsWith(".log"));
      const out: Array<{
        filename: string;
        entries: Array<{ timestamp: string; level: string; message: string; details?: string }>;
      }> = [];

      for (const f of files) {
        const content = await fsp.readFile(path.join(logDir, f), "utf-8");
        const entries: Array<{ timestamp: string; level: string; message: string; details?: string }> = [];
        for (const raw of content.split("\n")) {
          const line = raw.trim();
          if (!line) continue;
          const match = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.+)$/);
          if (match) {
            const [, ts, lvl, rest] = match;
            const pipeIdx = rest.indexOf("|");
            const msg = pipeIdx >= 0 ? rest.slice(0, pipeIdx).trim() : rest.trim();
            const details = pipeIdx >= 0 ? rest.slice(pipeIdx + 1).trim() : undefined;
            entries.push({ timestamp: ts, level: lvl.trim(), message: msg, details });
          } else {
            entries.push({ timestamp: "", level: "INFO", message: line });
          }
        }
        out.push({ filename: f, entries });
      }
      out.sort((a, b) => b.filename.localeCompare(a.filename));
      return out;
    } catch (err) {
      logError("Error leyendo logs de media backup", { error: (err as Error).message, companyId });
      return [];
    }
  }

  // ╭───────────────────────── Escaneo de archivos ────────────────╮

  /**
   * Escanea  public/company{id}/  (solo nivel raíz para archivos de tickets,
   * y NUNCA dentro de carpetas reservadas).
   *
   * Retorna 2 listas: oldFiles (candidatos a backup) y recentFiles (preservados).
   */
  async scanCompanyMedia(
    companyId: number,
    retentionDays: number
  ): Promise<{
    oldFiles: Array<{ fullPath: string; relativePath: string; size: number; mtime: Date }>;
    recentFiles: Array<{ fullPath: string; relativePath: string; size: number; mtime: Date }>;
  }> {
    const companyDir = this.getCompanyDir(companyId);
    const exists = await fsp
      .access(companyDir)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      return { oldFiles: [], recentFiles: [] };
    }

    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    let entries: import("fs").Dirent[];
    try {
      entries = await fsp.readdir(companyDir, { withFileTypes: true });
    } catch (err) {
      logWarn("No se pudo leer companyDir", { companyDir, error: (err as Error).message });
      return { oldFiles: [], recentFiles: [] };
    }

    const candidatePaths: string[] = [];
    for (const e of entries) {
      // Saltar carpetas reservadas — solo archivos directamente en public/company{id}/
      if (e.isDirectory()) continue;
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;
      if (e.name.startsWith(".")) continue; // ocultos
      candidatePaths.push(path.join(companyDir, e.name));
    }

    // stat con concurrencia limitada
    const stats = await mapWithConcurrency(candidatePaths, FS_CONCURRENCY, async fp => {
      try {
        const st = await fsp.stat(fp);
        return { fullPath: fp, size: st.size, mtime: st.mtime };
      } catch {
        return null;
      }
    });

    const oldFiles: Array<{ fullPath: string; relativePath: string; size: number; mtime: Date }> = [];
    const recentFiles: Array<{ fullPath: string; relativePath: string; size: number; mtime: Date }> = [];

    for (const s of stats) {
      if (!s) continue;
      const rel = path.relative(companyDir, s.fullPath);
      const item = { fullPath: s.fullPath, relativePath: rel, size: s.size, mtime: s.mtime };
      if (s.mtime.getTime() < cutoffMs) {
        oldFiles.push(item);
      } else {
        recentFiles.push(item);
      }
    }

    // Asegurarse de no incluir carpetas reservadas por error (defensa adicional)
    return {
      oldFiles: oldFiles.filter(f => !this.isInReservedFolder(f.relativePath)),
      recentFiles
    };
  }

  private isInReservedFolder(relPath: string): boolean {
    const parts = relPath.split(path.sep);
    return parts.some(p => RESERVED_FOLDERS.has(p));
  }

  // ╭───────────────────────── Crear ZIP + manifest ───────────────╮

  /**
   * Crea ZIP con archivos viejos + manifest JSON dentro. Retorna ruta + manifest.
   * NO borra nada. NO envía nada.
   */
  async createZip(
    companyId: number,
    files: Array<{ fullPath: string; relativePath: string; size: number; mtime: Date }>,
    retentionDays: number
  ): Promise<{ zipPath: string; manifest: BackupManifest } | null> {
    if (files.length === 0) return null;

    await fsp.mkdir(this.tmpDir, { recursive: true });

    const company = await Company.findByPk(companyId, { attributes: ["name", "email"] });
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const zipFileName = `media_backup_company${companyId}_${dateStr}.zip`;
    const zipPath = path.join(this.tmpDir, zipFileName);

    // Calcular manifest base (sin checksum aún si es muy pesado)
    const manifest: BackupManifest = {
      companyId,
      companyName: company?.name || null,
      generatedAt: new Date().toISOString(),
      retentionDays,
      cutoff: new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString(),
      totalFiles: 0,
      totalBytes: 0,
      zipPath,
      files: []
    };

    // Computar checksums sólo si el conjunto no es enorme (<200 archivos) — evita coste alto
    const computeChecksums = files.length <= 200;

    if (computeChecksums) {
      const checksums = await mapWithConcurrency(files, 4, async f => {
        try {
          const hash = crypto.createHash("sha256");
          await new Promise<void>((resolve, reject) => {
            const stream = fs.createReadStream(f.fullPath);
            stream.on("data", chunk => hash.update(chunk));
            stream.on("end", () => resolve());
            stream.on("error", reject);
          });
          return hash.digest("hex");
        } catch {
          return undefined;
        }
      });
      files.forEach((f, i) => {
        manifest.files.push({
          relativePath: f.relativePath,
          size: f.size,
          mtime: f.mtime.toISOString(),
          sha256: checksums[i]
        });
      });
    } else {
      for (const f of files) {
        manifest.files.push({
          relativePath: f.relativePath,
          size: f.size,
          mtime: f.mtime.toISOString()
        });
      }
    }

    manifest.totalFiles = manifest.files.length;
    manifest.totalBytes = manifest.files.reduce((a, b) => a + b.size, 0);

    // Crear ZIP por stream — NO carga en memoria
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const zip = archiver("zip", { zlib: { level: 6 } });

      let zipFinalized = false;
      output.on("close", () => {
        zipFinalized = true;
        resolve();
      });
      output.on("error", err => reject(err));
      zip.on("error", err => reject(err));
      zip.on("warning", err => {
        if ((err as any).code !== "ENOENT") {
          logWarn("Archiver warning", { error: err.message });
        }
      });

      zip.pipe(output);

      // Manifest dentro del ZIP
      zip.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

      let appended = 0;
      for (const f of files) {
        try {
          if (!fs.existsSync(f.fullPath)) {
            logWarn("Archivo desapareció antes de zip — saltando", { path: f.fullPath });
            continue;
          }
          // Ruta relativa dentro del zip: company{id}/<rel>
          const internalPath = path.posix.join(`company${companyId}`, f.relativePath.split(path.sep).join("/"));
          zip.file(f.fullPath, { name: internalPath });
          appended++;
        } catch (err) {
          logWarn("Error agregando archivo al ZIP", {
            path: f.fullPath,
            error: (err as Error).message
          });
        }
      }

      logInfo("Archivos añadidos a ZIP", { companyId, appended, total: files.length });
      zip.finalize().catch(err => {
        if (!zipFinalized) reject(err);
      });
    });

    return { zipPath, manifest };
  }

  // ╭───────────────────────── Validar ZIP ────────────────────────╮

  /**
   * Valida ZIP: existe, tamaño > min, contiene entries esperados.
   * Lee el header EOCD para contar entries sin extraer.
   */
  async validateZip(
    zipPath: string,
    expectedCount: number
  ): Promise<{ ok: boolean; reason?: string; zipSize?: number; entries?: number }> {
    try {
      const st = await fsp.stat(zipPath);
      if (st.size < DEFAULT_MIN_VALID_ZIP_BYTES) {
        return { ok: false, reason: "zip_size_too_small", zipSize: st.size };
      }
      const entries = await this.countZipEntries(zipPath);
      // Esperamos expectedCount + 1 (manifest.json)
      if (entries === -1) {
        return { ok: false, reason: "zip_corrupt_eocd", zipSize: st.size };
      }
      if (entries < expectedCount + 1) {
        return {
          ok: false,
          reason: `zip_entries_mismatch (esperado ${expectedCount + 1}, obtenido ${entries})`,
          zipSize: st.size,
          entries
        };
      }
      return { ok: true, zipSize: st.size, entries };
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  /**
   * Cuenta entries del ZIP leyendo End Of Central Directory (EOCD).
   * Retorna -1 si no se encuentra el header.
   */
  private async countZipEntries(zipPath: string): Promise<number> {
    const fd = await fsp.open(zipPath, "r");
    try {
      const st = await fd.stat();
      // EOCD vive en los últimos ~22 + 65535 bytes; leemos hasta 64KB del final
      const readSize = Math.min(st.size, 65557);
      const buf = Buffer.alloc(readSize);
      await fd.read(buf, 0, readSize, st.size - readSize);
      // EOCD signature: 0x06054b50
      for (let i = buf.length - 22; i >= 0; i--) {
        if (
          buf[i] === 0x50 &&
          buf[i + 1] === 0x4b &&
          buf[i + 2] === 0x05 &&
          buf[i + 3] === 0x06
        ) {
          // total entries on this disk @ offset i+10 (2 bytes LE)
          return buf.readUInt16LE(i + 10);
        }
      }
      return -1;
    } finally {
      await fd.close();
    }
  }

  // ╭───────────────────────── Resolver email destino ─────────────╮

  async resolveTargetEmail(companyId: number): Promise<string | null> {
    try {
      const company = await Company.findByPk(companyId, { attributes: ["email"] });
      if (company?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email)) {
        return company.email;
      }
    } catch (err) {
      logWarn("Error consultando email de Company", { companyId, error: (err as Error).message });
    }
    if (this.adminFallbackEmail) return this.adminFallbackEmail;
    return null;
  }

  // ╭───────────────────────── Enviar por Listmonk ────────────────╮

  /**
   * Obtiene provider Listmonk activo de la company, valida que sea listmonk,
   * y envía el ZIP como attachment vía /api/tx multipart.
   */
  async sendBackupEmail(
    companyId: number,
    zipPath: string,
    manifest: BackupManifest
  ): Promise<{ success: boolean; error?: string }> {
    const cfg = await EmailProviderConfig.findOne({
      where: { companyId, isActive: true }
    });
    if (!cfg || cfg.provider.toLowerCase() !== "listmonk") {
      return {
        success: false,
        error: `Provider activo no es listmonk (es '${cfg?.provider || "ninguno"}')`
      };
    }

    const provider = await ProviderFactory.getProvider(companyId);
    if (provider.getProviderName() !== "listmonk") {
      return { success: false, error: "ProviderFactory no devolvió listmonk" };
    }

    const to = await this.resolveTargetEmail(companyId);
    if (!to) {
      return { success: false, error: "No hay email destino (Company.email vacío y MEDIA_BACKUP_ADMIN_EMAIL no configurado)" };
    }

    const dateStr = new Date().toISOString().split("T")[0];
    const subject = `Backup multimedia ChatEAM - Company ${companyId} - ${dateStr}`;

    const totalMB = (manifest.totalBytes / (1024 * 1024)).toFixed(2);
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#3b82f6;">Backup mensual de multimedia</h2>
        <p>Hola${manifest.companyName ? ` ${manifest.companyName}` : ""},</p>
        <p>Adjuntamos el respaldo mensual de los archivos multimedia de tus tickets
        anteriores a los últimos <b>${manifest.retentionDays} días</b>.</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:4px 12px;color:#555;">Company</td><td style="padding:4px 12px;"><b>${manifest.companyName || `#${companyId}`}</b></td></tr>
          <tr><td style="padding:4px 12px;color:#555;">Archivos respaldados</td><td style="padding:4px 12px;"><b>${manifest.totalFiles}</b></td></tr>
          <tr><td style="padding:4px 12px;color:#555;">Tamaño total</td><td style="padding:4px 12px;"><b>${totalMB} MB</b></td></tr>
          <tr><td style="padding:4px 12px;color:#555;">Retención</td><td style="padding:4px 12px;"><b>${manifest.retentionDays} días</b></td></tr>
          <tr><td style="padding:4px 12px;color:#555;">Generado</td><td style="padding:4px 12px;">${manifest.generatedAt}</td></tr>
        </table>
        <p style="color:#555;">Los archivos anteriores al período de retención
        fueron archivados y eliminados del servidor para liberar espacio.
        Conserva este correo para acceder al archivo en el futuro.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
        <small style="color:#999;">Este es un mensaje automático del sistema de backup mensual.</small>
      </div>
    `;
    const text =
      `Backup mensual ChatEAM - Company ${manifest.companyName || companyId}\n` +
      `Archivos: ${manifest.totalFiles}\n` +
      `Tamaño: ${totalMB} MB\n` +
      `Retención: ${manifest.retentionDays} días\n` +
      `Generado: ${manifest.generatedAt}`;

    const fromEmail = (cfg as any).verifiedSenderEmail || process.env.LISTMONK_FROM_EMAIL || "";
    const fromName = (cfg as any).verifiedSenderName || process.env.LISTMONK_FROM_NAME || "ChatEAM Backup";

    const resp = await provider.sendEmail({
      to,
      from: fromEmail,
      fromName,
      subject,
      htmlContent: html,
      textContent: text,
      attachments: [
        {
          filename: path.basename(zipPath),
          path: zipPath,
          contentType: "application/zip"
        }
      ]
    });

    if (resp.success) {
      return { success: true };
    }
    return { success: false, error: resp.error || "send_failed" };
  }

  // ╭───────────────────────── Borrar originales viejos ───────────╮

  private async deleteOriginals(
    files: Array<{ fullPath: string; size: number }>,
    companyDir: string
  ): Promise<{ deleted: number; bytes: number }> {
    let deleted = 0;
    let bytes = 0;

    await mapWithConcurrency(files, FS_CONCURRENCY, async f => {
      // Defensa anti path-traversal — solo borrar si está dentro de companyDir
      if (!this.isWithinCompany(f.fullPath, companyDir)) {
        logWarn("Skip delete fuera de companyDir", { path: f.fullPath, companyDir });
        return;
      }
      try {
        await fsp.unlink(f.fullPath);
        deleted++;
        bytes += f.size;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          logWarn("Archivo ya no existe al borrar", { path: f.fullPath });
        } else {
          logWarn("Error borrando archivo", { path: f.fullPath, error: (err as Error).message });
        }
      }
    });

    return { deleted, bytes };
  }

  // ╭───────────────────────── Flujo principal por company ────────╮

  async backupCompany(
    companyId: number,
    options: MediaBackupOptions = {}
  ): Promise<CompanyBackupResult> {
    const retentionDays = options.retentionDays ?? this.retentionDays;
    const dryRun = !!options.dryRun;
    const result: CompanyBackupResult = { success: false, companyId, dryRun };

    // Lock anti doble ejecución
    const lock = dryRun ? { release: async () => {} } : await this.acquireLock(companyId);
    if (!lock) {
      result.skipped = true;
      result.reason = "lock_active";
      await this.writeCompanyLog(companyId, "WARN", "Backup omitido — lock activo");
      logWarn("Backup omitido — lock activo", { companyId });
      return result;
    }

    try {
      await this.writeCompanyLog(
        companyId,
        "INFO",
        `Inicio backup`,
        `retentionDays=${retentionDays} | dryRun=${dryRun}`
      );

      const companyDir = this.getCompanyDir(companyId);

      // 1. Escaneo
      const { oldFiles, recentFiles } = await this.scanCompanyMedia(companyId, retentionDays);
      result.totalCandidates = oldFiles.length;
      result.totalRecent = recentFiles.length;
      result.totalBytesCandidates = oldFiles.reduce((a, b) => a + b.size, 0);

      await this.writeCompanyLog(
        companyId,
        "INFO",
        `Escaneo completo`,
        `candidatos=${oldFiles.length} | preservados(${retentionDays}d)=${recentFiles.length} | bytesCandidatos=${result.totalBytesCandidates}`
      );

      if (oldFiles.length === 0) {
        await this.writeCompanyLog(companyId, "INFO", "No hay archivos viejos a respaldar");
        result.success = true;
        return result;
      }

      if (dryRun) {
        await this.writeCompanyLog(
          companyId,
          "INFO",
          `Dry-run completado`,
          `candidatos=${oldFiles.length} | bytes=${result.totalBytesCandidates}`
        );
        result.success = true;
        return result;
      }

      // 2. Crear ZIP
      const zipResult = await this.createZip(companyId, oldFiles, retentionDays);
      if (!zipResult) {
        result.error = "zip_creation_skipped_empty";
        await this.writeCompanyLog(companyId, "ERROR", "ZIP no creado", "razón=archivos_vacios");
        return result;
      }

      result.zipPath = zipResult.zipPath;

      // 3. Validar ZIP
      const validation = await this.validateZip(zipResult.zipPath, oldFiles.length);
      result.zipSize = validation.zipSize;

      if (!validation.ok) {
        await this.writeCompanyLog(
          companyId,
          "ERROR",
          `Validación ZIP falló`,
          `reason=${validation.reason} | size=${validation.zipSize ?? "-"}`
        );
        result.error = `zip_invalid: ${validation.reason}`;
        // NO borrar originales — fail-safe
        return result;
      }

      await this.writeCompanyLog(
        companyId,
        "INFO",
        `ZIP validado`,
        `path=${zipResult.zipPath} | size=${validation.zipSize} | entries=${validation.entries}`
      );

      // 4. Verificar límite de tamaño para envío por email
      const sizeMB = (validation.zipSize ?? 0) / (1024 * 1024);
      const overSizeLimit = sizeMB > this.maxEmailZipMB;

      // 5. Borrar originales (ZIP es válido → seguro)
      if (this.deleteAfterZip) {
        const del = await this.deleteOriginals(oldFiles, companyDir);
        result.originalsDeleted = del.deleted;
        result.originalsDeletedBytes = del.bytes;
        await this.writeCompanyLog(
          companyId,
          "INFO",
          `Originales borrados`,
          `count=${del.deleted} | bytes=${del.bytes}`
        );
      }

      // 6. Enviar email — solo si no supera límite y hay provider
      if (overSizeLimit) {
        result.zipKept = true;
        result.emailSent = false;
        result.emailError = `zip_over_size_limit ${sizeMB.toFixed(2)}MB > ${this.maxEmailZipMB}MB`;
        await this.writeCompanyLog(
          companyId,
          "WARN",
          `ZIP supera límite — no se envía por email`,
          `sizeMB=${sizeMB.toFixed(2)} | limit=${this.maxEmailZipMB} | path=${zipResult.zipPath}`
        );
        result.success = true; // Backup OK, sólo no se mandó por email
        // Marcar como último backup exitoso (archivado) aunque no se haya enviado
        await this.touchLastBackup(companyId);
        return result;
      }

      const emailResp = await this.sendBackupEmail(companyId, zipResult.zipPath, zipResult.manifest);

      if (emailResp.success) {
        result.emailSent = true;
        await this.writeCompanyLog(
          companyId,
          "INFO",
          `Email enviado vía Listmonk`,
          `zip=${path.basename(zipResult.zipPath)} | sizeMB=${sizeMB.toFixed(2)}`
        );

        // 7. Borrar ZIP local
        if (this.deleteZipAfterEmail) {
          try {
            await fsp.unlink(zipResult.zipPath);
            result.zipKept = false;
            await this.writeCompanyLog(companyId, "INFO", "ZIP local borrado tras envío");
          } catch (err) {
            result.zipKept = true;
            await this.writeCompanyLog(
              companyId,
              "WARN",
              `No se pudo borrar ZIP local`,
              (err as Error).message
            );
          }
        } else {
          result.zipKept = true;
        }

        await this.touchLastBackup(companyId);
        result.success = true;
      } else {
        result.emailSent = false;
        result.emailError = emailResp.error;
        result.zipKept = true;
        await this.writeCompanyLog(
          companyId,
          "ERROR",
          `Envío Listmonk falló`,
          `error=${emailResp.error} | zip=${zipResult.zipPath}`
        );
        // ZIP queda en /tmp para reintento manual. Originales ya fueron borrados (ZIP era válido).
        result.success = true; // El backup como tal es válido — solo el correo falló
      }

      return result;
    } catch (err) {
      result.error = (err as Error).message;
      logError("backupCompany excepción", { companyId, error: (err as Error).message });
      await this.writeCompanyLog(companyId, "ERROR", "Excepción en backup", (err as Error).message);
      return result;
    } finally {
      await lock.release();
    }
  }

  private async touchLastBackup(companyId: number): Promise<void> {
    try {
      await CompaniesSettings.update(
        { lastDriveBackupAt: new Date() } as any,
        { where: { companyId } }
      );
    } catch (err) {
      logWarn("No se pudo actualizar lastDriveBackupAt", { companyId, error: (err as Error).message });
    }
  }

  // ╭───────────────────────── Backup masivo ──────────────────────╮

  async backupAllCompanies(options: MediaBackupOptions = {}): Promise<BulkBackupStats> {
    const companies = await Company.findAll({
      attributes: ["id"],
      where: { status: true }
    });

    const stats: BulkBackupStats = {
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      totalBytesFreed: 0,
      results: []
    };

    logInfo("MediaBackup masivo iniciado", {
      companies: companies.length,
      retentionDays: options.retentionDays ?? this.retentionDays,
      dryRun: !!options.dryRun
    });

    for (const c of companies) {
      try {
        const r = await this.backupCompany(c.id, options);
        stats.results.push(r);
        stats.processed++;
        if (r.skipped) {
          stats.skipped++;
        } else if (r.success) {
          stats.successful++;
          stats.totalBytesFreed += r.originalsDeletedBytes || 0;
        } else {
          stats.failed++;
        }
      } catch (err) {
        stats.failed++;
        stats.processed++;
        logError("Excepción procesando company", {
          companyId: c.id,
          error: (err as Error).message
        });
      }
    }

    logInfo("MediaBackup masivo terminado", {
      processed: stats.processed,
      successful: stats.successful,
      failed: stats.failed,
      skipped: stats.skipped,
      totalBytesFreed: stats.totalBytesFreed
    });

    return stats;
  }

  // ╭───────────────────────── Status ─────────────────────────────╮

  async getStatus(companyId: number): Promise<BackupStatus> {
    const settings = await CompaniesSettings.findOne({
      where: { companyId },
      attributes: ["lastDriveBackupAt"]
    });
    return {
      enabled: true,
      retentionDays: this.retentionDays,
      tmpDir: this.tmpDir,
      maxEmailZipMB: this.maxEmailZipMB,
      lastBackupAt: settings?.lastDriveBackupAt || null,
      companyId
    };
  }
}

export default new MediaBackupService();
