import { head, has } from "lodash";
import XLSX from "xlsx";
import axios from "axios";
import ContactListItem from "../../models/ContactListItem";
import ContactList from "../../models/ContactList";
import Setting from "../../models/Setting";
import AppError from "../../errors/AppError";

export async function ImportEmailContacts(
  contactListId: number,
  companyId: number,
  file: Express.Multer.File | undefined
) {
  const contactList = await ContactList.findByPk(contactListId);

  if (!contactList) {
    throw new AppError("Lista de contactos no encontrada", 404);
  }

  if (!contactList.isEmailList || !contactList.acelleListUid) {
    throw new AppError("Esta lista no esta configurada para envio de emails", 400);
  }

  const workbook = XLSX.readFile(file?.path as string);
  const worksheet = head(Object.values(workbook.Sheets)) as any;
  const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 0 });

  const contacts = rows.map(row => {
    let name = "";
    let email = "";
    let number = "";

    if (has(row, "name") || has(row, "nombre") || has(row, "Name") || has(row, "Nombre")) {
      name = row["name"] || row["nombre"] || row["Name"] || row["Nombre"];
    }

    if (
      has(row, "email") ||
      has(row, "e-mail") ||
      has(row, "Email") ||
      has(row, "E-mail")
    ) {
      email = row["email"] || row["e-mail"] || row["Email"] || row["E-mail"];
    }

    if (
      has(row, "numero") ||
      has(row, "número") ||
      has(row, "Numero") ||
      has(row, "Número") ||
      has(row, "number")
    ) {
      number = row["numero"] || row["número"] || row["Numero"] || row["Número"] || row["number"];
      number = `${number}`.replace(/\D/g, "");
    }

    return { name, email, number: number || "", contactListId, companyId };
  });

  const emailApiUrl = await Setting.findOne({ where: { key: "emailApiUrl", companyId } });
  const emailApiKey = await Setting.findOne({ where: { key: "emailApiKey", companyId } });

  if (!emailApiUrl?.value || !emailApiKey?.value) {
    throw new AppError("API de email no configurada", 400);
  }

  const apiUrl = emailApiUrl.value;
  const apiToken = emailApiKey.value;

  const contactListLocal: ContactListItem[] = [];
  const errors: any[] = [];

  for (const contact of contacts) {
    if (!contact.email) {
      errors.push({ contact: contact.name, error: "Email es requerido" });
      continue;
    }

    try {
      // 1. Crear suscriptor en Acelle Mail primero
      const params = new URLSearchParams();
      params.append("api_token", apiToken);
      params.append("list_uid", contactList.acelleListUid);
      params.append("EMAIL", contact.email);
      params.append("status", "subscribed");

      const nameParts = contact.name.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      if (firstName) {
        params.append("FIRST_NAME", firstName);
      }
      if (lastName) {
        params.append("LAST_NAME", lastName);
      }

      await axios.post(
        `${apiUrl}/subscribers?${params.toString()}`,
        {},
        {
          headers: {
            "Accept": "application/json"
          }
        }
      );

      // 2. Si se creo exitosamente en Acelle, crear o actualizar en la base de datos local
      const [newContact, created] = await ContactListItem.findOrCreate({
        where: {
          email: contact.email,
          contactListId: contact.contactListId,
          companyId: contact.companyId
        },
        defaults: {
          name: contact.name,
          email: contact.email,
          number: contact.number,
          contactListId: contact.contactListId,
          companyId: contact.companyId,
          isWhatsappValid: true
        }
      });

      if (!created) {
        newContact.isWhatsappValid = true;
        await newContact.save();
      }

      contactListLocal.push(newContact);

    } catch (error: any) {
      console.error(`Error creando suscriptor ${contact.email}:`, error.response?.data || error.message);
      errors.push({
        contact: contact.email,
        error: error.response?.data?.message || error.message
      });
    }
  }

  return {
    imported: contactListLocal,
    errors: errors
  };
}
