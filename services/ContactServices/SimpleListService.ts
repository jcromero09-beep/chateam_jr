import Contact from "../../models/Contact";
import AppError from "../../errors/AppError";
import { FindOptions, Op } from "sequelize";

export interface SearchContactParams {
  companyId: string | number;
  name?: string;
}

const SimpleListService = async ({ name, companyId }: SearchContactParams): Promise<Contact[]> => {
  const options: FindOptions = {
    order: [
      ['name', 'ASC']
    ],
    // [Fase A P-1] Cap de seguridad: sin límite, un tenant grande (11k+ contactos) materializaba
    // ~7 MB en heap por request (riesgo OOM en el NAS). El autocompletado envía `name` y rara vez
    // necesita >500 resultados. Mantiene el contrato (array plano).
    limit: 500
  }

  if (name) {
    options.where = {
      name: {
        [Op.like]: `%${name}%`
      }
    }
  }

  options.where = {
    ...options.where,
    companyId
  }

  const contacts = await Contact.findAll(options);

  if (!contacts) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  return contacts;
};

export default SimpleListService;
