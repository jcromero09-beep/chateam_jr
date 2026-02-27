import { useAuth, Plan } from './useAuth'

export type PlanFeature =
  | 'whatsapp'
  | 'facebook'
  | 'instagram'
  | 'campaigns'
  | 'schedules'
  | 'internalChat'
  | 'externalApi'
  | 'kanban'
  | 'openai'
  | 'integrations'
  | 'marketing'
  | 'leads'

// Mapeo de características a propiedades del plan
const featureToProperty: Record<PlanFeature, keyof Plan> = {
  whatsapp: 'useWhatsapp',
  facebook: 'useFacebook',
  instagram: 'useInstagram',
  campaigns: 'useCampaigns',
  schedules: 'useSchedules',
  internalChat: 'useInternalChat',
  externalApi: 'useExternalApi',
  kanban: 'useKanban',
  openai: 'useOpenAi',
  integrations: 'useIntegrations',
  marketing: 'useMarketing',
  leads: 'useLeads'
}

export function usePlanFeatures() {
  const { user } = useAuth()

  const plan = user?.company?.plan

  /**
   * Verifica si una característica está habilitada en el plan
   */
  const hasFeature = (feature: PlanFeature): boolean => {
    // Super admin tiene acceso a todo
    if (user?.super) return true

    // Si no hay plan, denegar por defecto
    if (!plan) return false

    const property = featureToProperty[feature]
    return plan[property] === true
  }

  /**
   * Verifica si el plan tiene acceso a múltiples características
   */
  const hasFeatures = (features: PlanFeature[]): boolean => {
    return features.every(feature => hasFeature(feature))
  }

  /**
   * Verifica si el plan tiene acceso a al menos una de las características
   */
  const hasAnyFeature = (features: PlanFeature[]): boolean => {
    return features.some(feature => hasFeature(feature))
  }

  /**
   * Obtiene los límites del plan
   */
  const getLimits = () => {
    if (!plan) {
      return { users: 0, connections: 0, queues: 0 }
    }
    return {
      users: plan.users,
      connections: plan.connections,
      queues: plan.queues
    }
  }

  /**
   * Verifica si el plan está en período de prueba
   */
  const isTrial = (): boolean => {
    return plan?.trial ?? false
  }

  /**
   * Obtiene los días de prueba restantes (si aplica)
   */
  const getTrialDays = (): number => {
    return plan?.trialDays ?? 0
  }

  /**
   * Verifica si la empresa está activa
   */
  const isCompanyActive = (): boolean => {
    return user?.company?.status ?? false
  }

  /**
   * Verifica si el plan ha expirado
   */
  const isPlanExpired = (): boolean => {
    const dueDate = user?.company?.dueDate
    if (!dueDate) return false
    return new Date(dueDate) < new Date()
  }

  /**
   * Obtiene el nombre del plan actual
   */
  const getPlanName = (): string => {
    return plan?.name ?? 'Sin plan'
  }

  return {
    plan,
    hasFeature,
    hasFeatures,
    hasAnyFeature,
    getLimits,
    isTrial,
    getTrialDays,
    isCompanyActive,
    isPlanExpired,
    getPlanName
  }
}
