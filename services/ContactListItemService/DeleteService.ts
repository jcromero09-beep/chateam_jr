import ContactListItem from "../../models/ContactListItem";
import AppError from "../../errors/AppError";

const DeleteService = async (id: string, companyId: string | number): Promise<void> => {
  // [W1-SEC-12] Acota al tenant: sin companyId, un id ajeno se borraba cross-tenant.
  const record = await ContactListItem.findOne({
    where: { id, companyId }
  });

  if (!record) {
    throw new AppError("ERR_NO_CONTACTLISTITEM_FOUND", 404);
  }

  await record.destroy();
};

export default DeleteService;
