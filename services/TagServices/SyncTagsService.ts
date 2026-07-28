import Tag from "../../models/Tag";
import Contact from "../../models/Contact";
import ContactTag from "../../models/ContactTag";
import AppError from "../../errors/AppError";

interface Request {
  tags: Tag[];
  contactId: number;
  companyId: number;
}

const SyncTags = async ({
  tags,
  contactId,
  companyId
}: Request): Promise<Contact | null> => {
  // [W1-SEC-IDOR] validar propiedad del contacto antes de reescribir sus tags
  // (ContactTag no tiene companyId → destroy/bulkCreate sin scope de tenant).
  const contact = await Contact.findOne({
    where: { id: contactId, companyId },
    include: [Tag]
  });
  if (!contact) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  const tagList = tags.map(t => ({ tagId: t.id, contactId }));

  await ContactTag.destroy({ where: { contactId } });
  await ContactTag.bulkCreate(tagList);

  contact?.reload();

  return contact;
};

export default SyncTags;
