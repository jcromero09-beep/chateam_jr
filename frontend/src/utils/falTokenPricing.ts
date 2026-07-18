import type { FalCatalogEntry } from '../services/ugcModelSelectorService'

// Debe mantenerse sincronizado con services/Billing/falCostToCompanyTokens.ts.
const FAL_USD_TO_COMPANY_TOKENS = 100

export function falCostUsdToCompanyTokens(estimatedCostUsd: number): number {
  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) return 0
  if (estimatedCostUsd === 0) return 0
  return Math.ceil(estimatedCostUsd * FAL_USD_TO_COMPANY_TOKENS)
}

function pluralizeToken(tokens: number): string {
  return tokens === 1 ? 'token' : 'tokens'
}

export function formatTokenAmount(tokens: number): string {
  return `${tokens} ${pluralizeToken(tokens)}`
}

export function formatFalPricingAsTokens(
  pricing: FalCatalogEntry['pricing'],
  estimatedScriptChars = 1000
): string {
  if (pricing.unit === 'second') {
    const tokens = falCostUsdToCompanyTokens(pricing.estimateUsd)
    return `${formatTokenAmount(tokens)} / s`
  }

  if (pricing.unit === 'image') {
    const tokens = falCostUsdToCompanyTokens(pricing.estimateUsd)
    return `${formatTokenAmount(tokens)} / imagen`
  }

  const tokens = falCostUsdToCompanyTokens(
    pricing.estimateUsd * estimatedScriptChars
  )
  return `~${formatTokenAmount(tokens)} / ${estimatedScriptChars.toLocaleString('es-MX')} chars`
}
