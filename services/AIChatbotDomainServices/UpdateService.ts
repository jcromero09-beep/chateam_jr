import AIChatbotDomain from "../../models/AIChatbotDomain";
import AppError from "../../errors/AppError";

interface Request {
  id: number;
  companyId: number;
  domain?: string;
  customCss?: string;
  customJs?: string;
  allowedOrigins?: string[];
  sslEnabled?: boolean;
  status?: "pending_dns" | "active" | "suspended";
}

const UpdateService = async ({ id, companyId, ...data }: Request): Promise<AIChatbotDomain> => {
  const record = await AIChatbotDomain.findOne({ where: { id, companyId } });

  if (!record) {
    throw new AppError("ERR_DOMAIN_NOT_FOUND", 404);
  }

  const updateData: any = {};
  if (data.domain !== undefined) updateData.domain = data.domain;
  if (data.customCss !== undefined) updateData.customCss = data.customCss;
  if (data.customJs !== undefined) updateData.customJs = data.customJs;
  if (data.allowedOrigins !== undefined) updateData.allowedOrigins = data.allowedOrigins;
  if (data.sslEnabled !== undefined) updateData.sslEnabled = data.sslEnabled;
  if (data.status !== undefined) updateData.status = data.status;

  await record.update(updateData);
  await record.reload();

  return record;
};

export default UpdateService;
