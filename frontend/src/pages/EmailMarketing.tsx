import { useState, useEffect, useCallback } from 'react'
import {
  EnvelopeSimple,
  Megaphone,
  Users,
  TrendUp,
  Play,
  Pause,
  Trash,
  Plus,
  ArrowClockwise,
} from '@phosphor-icons/react'
// [migración] CircularProgress se conserva como MUI (no hay equivalente Radix).
import { CircularProgress } from '@mui/joy'
import { useNavigate } from 'react-router-dom'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import * as emailService from '../services/emailCampaignService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailCampaign {
  id: number | string
  name: string
  subject?: string
  status?: string
  contactListId?: number | string
  contactList?: { name: string }
  createdAt?: string
  scheduledAt?: string
  run_at?: string
}

interface ContactList {
  id: number | string
  name: string
}

interface Stats {
  totalCampaigns: number
  active: number
  completed: number
  totalLists: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusVariant(status: string | undefined): BadgeProps['variant'] {
  switch (status) {
    case 'INACTIVA':
      return 'neutral'
    case 'PROGRAMADA':
      return 'warning'
    case 'EN_ANDAMENTO':
      return 'primary'
    case 'CANCELADA':
      return 'destructive'
    case 'FINALIZADA':
      return 'success'
    default:
      return 'neutral'
  }
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case 'INACTIVA':
      return 'Inactiva'
    case 'PROGRAMADA':
      return 'Programada'
    case 'EN_ANDAMENTO':
      return 'En andamiento'
    case 'CANCELADA':
      return 'Cancelada'
    case 'FINALIZADA':
      return 'Finalizada'
    default:
      return status ?? 'Desconocido'
  }
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '-'
  }
}

// ---------------------------------------------------------------------------
// Row action button (mismo look que RowAction del prototipo, con onClick)
// ---------------------------------------------------------------------------

function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Stat Card sub-component
// ---------------------------------------------------------------------------

type StatTone = 'primary' | 'success' | 'neutral' | 'warning'

const statToneClasses: Record<StatTone, string> = {
  primary: 'bg-brand-teal/10 text-brand-teal',
  success: 'bg-success/14 text-success-text',
  neutral: 'bg-muted text-muted-foreground',
  warning: 'bg-warning/16 text-warning-text',
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number
  tone: StatTone
}

function StatCard({ icon, label, value, tone }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-lg',
            statToneClasses[tone],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight tabular-nums text-foreground">
            {value}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EmailMarketing() {
  const navigate = useNavigate()

  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | string | null>(null)
  const [stats, setStats] = useState<Stats>({
    totalCampaigns: 0,
    active: 0,
    completed: 0,
    totalLists: 0,
  })

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [campaignsRes, listsRes] = await Promise.all([
        emailService.listEmailCampaigns({ pageNumber: 1 }),
        emailService.listContactLists({ pageNumber: 1 }),
      ])

      const rawCampaigns: EmailCampaign[] = Array.isArray(campaignsRes)
        ? campaignsRes
        : (campaignsRes?.campaigns ?? campaignsRes?.data ?? [])

      const rawLists: ContactList[] = Array.isArray(listsRes)
        ? listsRes
        : (listsRes?.contactLists ?? listsRes?.data ?? [])

      setCampaigns(rawCampaigns)

      const active = rawCampaigns.filter((c) => c.status === 'EN_ANDAMENTO').length
      const completed = rawCampaigns.filter((c) => c.status === 'FINALIZADA').length

      setStats({
        totalCampaigns: rawCampaigns.length,
        active,
        completed,
        totalLists: rawLists.length,
      })
    } catch (err) {
      console.error('[EmailMarketing] Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleRestart = async (id: number | string) => {
    setActionLoading(id)
    try {
      await emailService.restartCampaign(id)
      await fetchData()
    } catch (err) {
      console.error('[EmailMarketing] Error restarting campaign:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancel = async (id: number | string) => {
    setActionLoading(id)
    try {
      await emailService.cancelCampaign(id)
      await fetchData()
    } catch (err) {
      console.error('[EmailMarketing] Error cancelling campaign:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id: number | string) => {
    if (!window.confirm('Confirmar eliminacion de esta campana?')) return
    setActionLoading(id)
    try {
      await emailService.deleteEmailCampaign(id)
      await fetchData()
    } catch (err) {
      console.error('[EmailMarketing] Error deleting campaign:', err)
    } finally {
      setActionLoading(null)
    }
  }

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const recentCampaigns = campaigns.slice(0, 10)

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">

        {/* ---------------------------------------------------------------- */}
        {/* Header                                                             */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <EnvelopeSimple className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Email Marketing
              </h1>
              <p className="text-sm text-muted-foreground">
                Dashboard de campanas de email
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actualizar datos"
              title="Actualizar datos"
              className="text-muted-foreground"
              onClick={fetchData}
              disabled={loading}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/email-marketing/templates')}
            >
              <Users className="size-4" aria-hidden />
              Ver Listas
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/email-marketing/campaigns')}
            >
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Campana
            </Button>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Loading state                                                      */}
        {/* ---------------------------------------------------------------- */}
        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <CircularProgress size="lg" />
              <p className="text-sm text-muted-foreground">Cargando datos...</p>
            </div>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------------------ */}
            {/* Stat cards                                                     */}
            {/* ------------------------------------------------------------ */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Megaphone className="size-5" weight="fill" aria-hidden />}
                label="Total Campanas"
                value={stats.totalCampaigns}
                tone="primary"
              />
              <StatCard
                icon={<TrendUp className="size-5" weight="fill" aria-hidden />}
                label="Activas"
                value={stats.active}
                tone="success"
              />
              <StatCard
                icon={<EnvelopeSimple className="size-5" weight="fill" aria-hidden />}
                label="Completadas"
                value={stats.completed}
                tone="neutral"
              />
              <StatCard
                icon={<Users className="size-5" weight="fill" aria-hidden />}
                label="Listas de Email"
                value={stats.totalLists}
                tone="warning"
              />
            </div>

            {/* ------------------------------------------------------------ */}
            {/* Recent campaigns table                                         */}
            {/* ------------------------------------------------------------ */}
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <h2 className="text-base font-semibold text-foreground">
                  Campanas Recientes
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Mostrando las ultimas {recentCampaigns.length} campanas
                </p>
              </div>

              {recentCampaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-16">
                  <Megaphone
                    className="size-12 text-muted-foreground/60"
                    aria-hidden
                  />
                  <p className="text-sm text-muted-foreground">
                    No hay campanas creadas aun
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate('/email-marketing/campaigns')}
                  >
                    <Plus className="size-4" weight="bold" aria-hidden />
                    Crear primera campana
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left">
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Nombre
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Asunto
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Lista
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Estado
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Fecha
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentCampaigns.map((campaign) => (
                        <tr
                          key={campaign.id}
                          className="transition-colors hover:bg-accent/40"
                        >
                          {/* Nombre */}
                          <td className="px-4 py-3">
                            <span className="block max-w-[190px] truncate font-medium text-foreground">
                              {campaign.name}
                            </span>
                          </td>

                          {/* Asunto */}
                          <td className="px-4 py-3">
                            <span className="block max-w-[190px] truncate text-muted-foreground">
                              {campaign.subject ?? '-'}
                            </span>
                          </td>

                          {/* Lista */}
                          <td className="px-4 py-3">
                            <span className="block max-w-[140px] truncate text-muted-foreground">
                              {campaign.contactList?.name ?? '-'}
                            </span>
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant(campaign.status)}>
                              {statusLabel(campaign.status)}
                            </Badge>
                          </td>

                          {/* Fecha */}
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {formatDate(
                              campaign.run_at ?? campaign.scheduledAt ?? campaign.createdAt,
                            )}
                          </td>

                          {/* Acciones */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5">
                              {actionLoading === campaign.id ? (
                                <CircularProgress size="sm" sx={{ mx: 1 }} />
                              ) : (
                                <>
                                  <ActionBtn
                                    label="Reiniciar campana"
                                    onClick={() => handleRestart(campaign.id)}
                                    disabled={campaign.status === 'EN_ANDAMENTO'}
                                    className="text-success-text hover:bg-success/10 hover:text-success-text"
                                  >
                                    <Play className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                  <ActionBtn
                                    label="Cancelar campana"
                                    onClick={() => handleCancel(campaign.id)}
                                    disabled={
                                      campaign.status === 'CANCELADA' ||
                                      campaign.status === 'FINALIZADA' ||
                                      campaign.status === 'INACTIVA'
                                    }
                                    className="text-warning-text hover:bg-warning/10 hover:text-warning-text"
                                  >
                                    <Pause className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                  <ActionBtn
                                    label="Eliminar campana"
                                    onClick={() => handleDelete(campaign.id)}
                                    className="hover:bg-destructive/10 hover:text-destructive-text"
                                  >
                                    <Trash className="size-[18px]" aria-hidden />
                                  </ActionBtn>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ------------------------------------------------------------ */}
            {/* Footer navigation                                              */}
            {/* ------------------------------------------------------------ */}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/email-marketing/templates')}
              >
                Administrar listas de contactos
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary"
                onClick={() => navigate('/email-marketing/campaigns')}
              >
                Ver todas las campanas
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
