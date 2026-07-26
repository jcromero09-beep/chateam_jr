import Tag from "../../models/Tag";
import AppError from "../../errors/AppError";

const DeleteService = async (id: string | number, companyId: string | number): Promise<void> => {
  // [W1-SEC-12] Acota al tenant: sin companyId, un id ajeno se borraba cross-tenant.
  const tag = await Tag.findOne({
    where: { id, companyId }
  });

  if (!tag) {
    throw new AppError("ERR_NO_TAG_FOUND", 404);
  }

  await tag.destroy();
};

export default DeleteService;
