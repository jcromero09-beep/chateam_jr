import lodash from "lodash";
const { head, has } = lodash;
import XLSX from "xlsx";
import ContactListItem from "../../models/ContactListItem";
import ContactList from "../../models/ContactList";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { EmailMarketingFactory } from "../EmailMarketing/providers/EmailMarketingFactory";
import { ImportContact } from "../EmailMarketing/providers/EmailMarketingProvider";

interface ImportRow {
  name: string;
  email: string;
  number: string;
  contactListId: number;
  companyId: number;
}

interface ImportResult {
  imported: ContactListItem[];
  errors: Array<{ contact: string; error: string }>;
  remoteSummary: {
    totalRequested: number;
    totalImported: number;
    totalFailed: number;
  };
}

/**
 * Importar contactos a una lista de email.
 *
 * Flujo:
 *   1. Parsear CSV/XLSX (columnas flexibles: name|nombre|Name|Nombre,
 *      email|e-mail|Email|E-mail, number|numero|número)
 *   2. Validar emails localmente
 *   3. Resolver provider activo via EmailMarketingFactory
 *   4. Llamar provider.importSubscribers (un sync masivo)
 *   5. Para cada importado correctamente, crear o actualizar ContactListItem local
 *   6. Retornar { imported, errors, remoteSummary }
 *
 * Si no hay provider activo o la lista no esta sincronizada, lanzar AppError.
 */
export async function ImportEmailContacts(
  contactListId: number,
  companyId: number,
  file: Express.Multer.File | undefined
): Promise<ImportResult> {
  if (!file) {
    throw new AppError("Archivo requerido para importar contactos", 400);
  }

  const contactList = await ContactList.findByPk(contactListId);

  if (!contactList) {
    throw new AppError("Lista de contactos no encontrada", 404);
  }

  if (!contactList.isEmailList) {
    throw new AppError("Esta lista no esta configurada para envio de emails", 400);
  }

  const providerListId = contactList.providerListId || contactList.acelleListUid;
  if (!providerListId) {
    throw new AppError(
      "Esta lista no esta sincronizada con ningun provider. Edite la lista para resincronizar.",
      400
    );
  }

  // ---------- 1. Parsear archivo ----------
  const workbook = XLSX.readFile(file.path);
  const worksheet = head(Object.values(workbook.Sheets)) as XLSX.WorkSheet;
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, { header: 0 });

  const parsed: ImportRow[] = rows.map(row => {
    let name = "";
    let email = "";
    let number = "";

    if (has(row, "name") || has(row, "nombre") || has(row, "Name") || has(row, "Nombre")) {
      name = String(row["name"] || row["nombre"] || row["Name"] || row["Nombre"] || "");
    }

    if (
      has(row, "email") || has(row, "e-mail") ||
      has(row, "Email") || has(row, "E-mail")
    ) {
      email = String(row["email"] || row["e-mail"] || row["Email"] || row["E-mail"] || "");
    }

    if (
      has(row, "numero") || has(row, "número") ||
      has(row, "Numero") || has(row, "Número") || has(row, "number")
    ) {
      number = String(
        row["numero"] || row["número"] || row["Numero"] || row["Número"] || row["number"] || ""
      );
      number = number.replace(/\D/g, "");
    }

    return { name: name.trim(), email: email.trim(), number, contactListId, companyId };
  });

  // ---------- 2. Pre-validar y separar errores locales ----------
  const errors: Array<{ contact: string; error: string }> = [];
  const validRows: ImportRow[] = [];

  for (const row of parsed) {
    if (!row.email) {
      errors.push({ contact: row.name || "(sin nombre)", error: "Email es requerido" });
      continue;
    }
    validRows.push(row);
  }

  // ---------- 3. Provider activo + sync masivo ----------
  const provider = await EmailMarketingFactory.getProvider(companyId);

  // Verificar coherencia: provider activo debe coincidir con el de la lista
  const expected = contactList.provider || (contactList.acelleListUid ? "acelle" : null);
  if (expected && expected !== provider.getProviderName()) {
    logger.warn(
      `[ImportEmailContacts] Lista ${contactListId} fue sincronizada con '${expected}' pero provider activo es '${provider.getProviderName()}'. Importando contra el activo.`
    );
  }

  const importPayload: ImportContact[] = validRows.map(r => ({
    email: r.email,
    name: r.name
  }));

  const remoteResult = await provider.importSubscribers(providerListId, importPayload);

  if (!remoteResult.success) {
    throw new AppError(
      `Error al importar contactos en ${provider.getProviderName()}: ${remoteResult.error || "error desconocido"}`,
      400
    );
  }

  // Mergear errores remotos en la lista de errores
  for (const e of remoteResult.data?.errors || []) {
    errors.push({ contact: e.email, error: e.error });
  }

  // ---------- 4. Crear/actualizar locales solo para los que NO fallaron remoto ----------
  const failedEmails = new Set((remoteResult.data?.errors || []).map(e => e.email.toLowerCase()));
  const imported: ContactListItem[] = [];

  for (const row of validRows) {
    if (failedEmails.has(row.email.toLowerCase())) continue;

    try {
      const [item, created] = await ContactListItem.findOrCreate({
        where: {
          email: row.email,
          contactListId: row.contactListId,
          companyId: row.companyId
        },
        defaults: {
          name: row.name,
          email: row.email,
          number: row.number,
          contactListId: row.contactListId,
          companyId: row.companyId,
          isWhatsappValid: true
        } as any
      });

      if (!created) {
        item.isWhatsappValid = true;
        if (row.name && !item.name) item.name = row.name;
        if (row.number && !item.number) item.number = row.number;
        await item.save();
      }

      imported.push(item);
    } catch (err) {
      errors.push({
        contact: row.email,
        error: (err as Error).message || "Error guardando local"
      });
    }
  }

  return {
    imported,
    errors,
    remoteSummary: {
      totalRequested: remoteResult.data?.totalRequested || validRows.length,
      totalImported: remoteResult.data?.totalImported || 0,
      totalFailed: remoteResult.data?.totalFailed || 0
    }
  };
}
