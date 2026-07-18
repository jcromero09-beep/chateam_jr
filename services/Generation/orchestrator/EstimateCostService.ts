/**
 * EstimateCostService — capa NEUTRAL de estimación de costo (spec §6).
 *
 * Pipeline:
 *   1. Resuelve el provider del modelo.
 *   2. Pide el costo CRUDO en USD al proveedor (estimateProviderCostUsd).
 *   3. Aplica markup (por plan/tenant) y convierte a créditos internos.
 *   4. Devuelve un CostEstimate listo para el botón "Generate" dinámico.
 *
 * No descuenta nada — es de solo lectura.
 */

import type { GenerationRequest, CostEstimate, ProviderId } from "../types";
import { getProvider, resolveProviderForModel } from "../ProviderRegistry";
import { resolveMarkup } from "../markup";
import {
  generationCostUsdToCompanyTokens,
  getCreditTypeKeyForMediaType
} from "../../Billing/generationCostToCompanyTokens";

interface EstimateCostInput {
  req: GenerationRequest;
  /** Si se conoce el provider, evita el lookup por modelo. */
  providerId?: ProviderId;
}

const EstimateCostService = async ({
  req,
  providerId
}: EstimateCostInput): Promise<CostEstimate> => {
  const provider = providerId
    ? getProvider(providerId)
    : await resolveProviderForModel(req.modelId, req.tenantId);

  const providerCostUsd = await provider.estimateProviderCostUsd(req);
  const markup = await resolveMarkup(req.tenantId);
  const costWithMarkup = providerCostUsd * markup;
  const credits = generationCostUsdToCompanyTokens(costWithMarkup);

  const creditTypeKey = provider.resolveCreditTypeKey
    ? provider.resolveCreditTypeKey(req)
    : getCreditTypeKeyForMediaType(req.mediaType);

  return {
    providerCostUsd,
    markup,
    credits,
    creditTypeKey,
    displayLabel:
      credits > 0
        ? `${credits} crédito${credits === 1 ? "" : "s"}`
        : "Gratis"
  };
};

export default EstimateCostService;
