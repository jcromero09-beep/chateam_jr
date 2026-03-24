/**
 * Service: CreateCreatorService
 * Crea un nuevo creador de contenido UGC en la red de creadores.
 * Valida email unico por company.
 * NO crea Stripe Connect account aqui (se hace despues).
 */

import UGCCreator from "../../models/UGCCreator";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface CreateCreatorRequest {
  companyId: number;
  name: string;
  email: string;
  phone?: string;
  niche: string;
  platforms: string[];
  baseRate: number;
  currency?: string;
  paymentMethod: string;
  portfolio?: Record<string, unknown>[];
  tags?: string[];
}

interface CreateCreatorResponse {
  creator: UGCCreator;
}

const CreateCreatorService = async (
  params: CreateCreatorRequest
): Promise<CreateCreatorResponse> => {
  const {
    companyId,
    name,
    email,
    phone,
    niche,
    platforms,
    baseRate,
    currency = "USD",
    paymentMethod,
    portfolio = [],
    tags = []
  } = params;

  if (!name || !email || !niche) {
    throw new AppError("ERR_UGC_CREATOR_MISSING_REQUIRED_FIELDS", 400);
  }

  // Validar email unico por company
  const existingCreator = await UGCCreator.findOne({
    where: { email, companyId }
  });

  if (existingCreator) {
    throw new AppError("ERR_UGC_CREATOR_EMAIL_ALREADY_EXISTS", 409);
  }

  const creator = await UGCCreator.create({
    companyId,
    name,
    email,
    phone: phone || undefined,
    niche,
    platforms,
    baseRate,
    currency,
    paymentMethod,
    portfolio,
    tags,
    status: "pending"
  } as Partial<UGCCreator> as UGCCreator);

  logger.info(
    `[CreateCreatorService] Creador creado: id=${creator.id}, name=${name}, ` +
    `email=${email}, niche=${niche}, company=${companyId}`
  );

  return { creator };
};

export default CreateCreatorService;
