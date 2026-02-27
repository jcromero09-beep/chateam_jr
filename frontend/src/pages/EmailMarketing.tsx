import { useState, useEffect, useCallback } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Sheet,
  Table,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/joy'
import {
  Email as EmailIcon,
  Campaign as CampaignIcon,
  People as PeopleIcon,
  TrendingUp as TrendingUpIcon,
  PlayArrow as PlayArrowIcon,
  Pause as PauseIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
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

type ChipColor = 'neutral' | 'warning' | 'primary' | 'danger' | 'success'

function statusColor(status: string | undefined): ChipColor {
  switch (status) {
    case 'INACTIVA':
      return 'neutral'
    case 'PROGRAMADA':
      return 'warning'
    case 'EN_ANDAMENTO':
      return 'primary'
    case 'CANCELADA':
      return 'danger'
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
// Stat Card sub-component
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number
  iconBg: string
  iconColor: string
}

function StatCard({ icon, label, value, iconBg, iconColor }: StatCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 'lg',
        boxShadow: 'sm',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: 'md' },
      }}
    >
      <CardContent>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 'md',
              bgcolor: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: iconColor,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography level="h3" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {value}
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary', mt: 0.25 }}>
              {label}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
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
    <Container maxWidth="xl" sx={{ py: 3 }}>

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        sx={{ mb: 3, gap: 1.5 }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 'md',
              bgcolor: 'primary.softBg',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <EmailIcon sx={{ color: 'primary.plainColor', fontSize: 24 }} />
          </Box>
          <Box>
            <Typography level="h3" sx={{ fontWeight: 700 }}>
              Email Marketing
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              Dashboard de campanas de email
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
          <Tooltip title="Actualizar datos">
            <IconButton
              variant="outlined"
              color="neutral"
              onClick={fetchData}
              disabled={loading}
              size="sm"
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            color="neutral"
            size="sm"
            startDecorator={<PeopleIcon fontSize="small" />}
            onClick={() => navigate('/email-marketing/templates')}
          >
            Ver Listas
          </Button>
          <Button
            variant="solid"
            color="primary"
            size="sm"
            startDecorator={<AddIcon fontSize="small" />}
            onClick={() => navigate('/email-marketing/campaigns')}
          >
            Nueva Campana
          </Button>
        </Stack>
      </Stack>

      {/* ------------------------------------------------------------------ */}
      {/* Loading state                                                        */}
      {/* ------------------------------------------------------------------ */}
      {loading ? (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 320,
          }}
        >
          <Stack spacing={2} alignItems="center">
            <CircularProgress size="lg" />
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              Cargando datos...
            </Typography>
          </Stack>
        </Box>
      ) : (
        <>
          {/* -------------------------------------------------------------- */}
          {/* Stat cards                                                       */}
          {/* -------------------------------------------------------------- */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid xs={12} sm={6} md={3}>
              <StatCard
                icon={<CampaignIcon fontSize="small" />}
                label="Total Campanas"
                value={stats.totalCampaigns}
                iconBg="primary.softBg"
                iconColor="primary.plainColor"
              />
            </Grid>
            <Grid xs={12} sm={6} md={3}>
              <StatCard
                icon={<TrendingUpIcon fontSize="small" />}
                label="Activas"
                value={stats.active}
                iconBg="success.softBg"
                iconColor="success.plainColor"
              />
            </Grid>
            <Grid xs={12} sm={6} md={3}>
              <StatCard
                icon={<EmailIcon fontSize="small" />}
                label="Completadas"
                value={stats.completed}
                iconBg="neutral.softBg"
                iconColor="neutral.plainColor"
              />
            </Grid>
            <Grid xs={12} sm={6} md={3}>
              <StatCard
                icon={<PeopleIcon fontSize="small" />}
                label="Listas de Email"
                value={stats.totalLists}
                iconBg="warning.softBg"
                iconColor="warning.plainColor"
              />
            </Grid>
          </Grid>

          {/* -------------------------------------------------------------- */}
          {/* Recent campaigns table                                           */}
          {/* -------------------------------------------------------------- */}
          <Card variant="outlined" sx={{ borderRadius: 'lg', boxShadow: 'sm' }}>
            <CardContent sx={{ p: 0 }}>
              <Box
                sx={{
                  px: 3,
                  py: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography level="title-md" sx={{ fontWeight: 600 }}>
                  Campanas Recientes
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.secondary', mt: 0.25 }}>
                  Mostrando las ultimas {recentCampaigns.length} campanas
                </Typography>
              </Box>

              {recentCampaigns.length === 0 ? (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 8,
                    gap: 2,
                  }}
                >
                  <CampaignIcon sx={{ fontSize: 52, color: 'text.tertiary' }} />
                  <Typography level="body-md" sx={{ color: 'text.secondary' }}>
                    No hay campanas creadas aun
                  </Typography>
                  <Button
                    variant="solid"
                    color="primary"
                    size="sm"
                    startDecorator={<AddIcon fontSize="small" />}
                    onClick={() => navigate('/email-marketing/campaigns')}
                  >
                    Crear primera campana
                  </Button>
                </Box>
              ) : (
                <Sheet
                  sx={{
                    overflow: 'auto',
                    borderRadius: '0 0 var(--Card-radius) var(--Card-radius)',
                  }}
                >
                  <Table
                    borderAxis="xBetween"
                    hoverRow
                    sx={{
                      '& thead th': {
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'text.secondary',
                        py: 1.5,
                        px: 2,
                        bgcolor: 'background.level1',
                        whiteSpace: 'nowrap',
                      },
                      '& tbody td': {
                        py: 1.5,
                        px: 2,
                        fontSize: '0.875rem',
                      },
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ width: '22%' }}>Nombre</th>
                        <th style={{ width: '22%' }}>Asunto</th>
                        <th style={{ width: '16%' }}>Lista</th>
                        <th style={{ width: '13%' }}>Estado</th>
                        <th style={{ width: '13%' }}>Fecha</th>
                        <th style={{ width: '14%' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentCampaigns.map((campaign) => (
                        <tr key={campaign.id}>

                          {/* Nombre */}
                          <td>
                            <Typography
                              level="body-sm"
                              sx={{
                                fontWeight: 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 190,
                              }}
                            >
                              {campaign.name}
                            </Typography>
                          </td>

                          {/* Asunto */}
                          <td>
                            <Typography
                              level="body-sm"
                              sx={{
                                color: 'text.secondary',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 190,
                              }}
                            >
                              {campaign.subject ?? '-'}
                            </Typography>
                          </td>

                          {/* Lista */}
                          <td>
                            <Typography
                              level="body-sm"
                              sx={{
                                color: 'text.secondary',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 140,
                              }}
                            >
                              {campaign.contactList?.name ?? '-'}
                            </Typography>
                          </td>

                          {/* Estado */}
                          <td>
                            <Chip
                              size="sm"
                              color={statusColor(campaign.status)}
                              variant="soft"
                              sx={{ fontWeight: 500 }}
                            >
                              {statusLabel(campaign.status)}
                            </Chip>
                          </td>

                          {/* Fecha */}
                          <td>
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                              {formatDate(
                                campaign.run_at ?? campaign.scheduledAt ?? campaign.createdAt
                              )}
                            </Typography>
                          </td>

                          {/* Acciones */}
                          <td>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              {actionLoading === campaign.id ? (
                                <CircularProgress size="sm" sx={{ mx: 1 }} />
                              ) : (
                                <>
                                  <Tooltip title="Reiniciar campana" placement="top">
                                    <span>
                                      <IconButton
                                        size="sm"
                                        variant="plain"
                                        color="success"
                                        onClick={() => handleRestart(campaign.id)}
                                        disabled={campaign.status === 'EN_ANDAMENTO'}
                                      >
                                        <PlayArrowIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Cancelar campana" placement="top">
                                    <span>
                                      <IconButton
                                        size="sm"
                                        variant="plain"
                                        color="warning"
                                        onClick={() => handleCancel(campaign.id)}
                                        disabled={
                                          campaign.status === 'CANCELADA' ||
                                          campaign.status === 'FINALIZADA' ||
                                          campaign.status === 'INACTIVA'
                                        }
                                      >
                                        <PauseIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Eliminar campana" placement="top">
                                    <IconButton
                                      size="sm"
                                      variant="plain"
                                      color="danger"
                                      onClick={() => handleDelete(campaign.id)}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}
                            </Stack>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Sheet>
              )}
            </CardContent>
          </Card>

          {/* -------------------------------------------------------------- */}
          {/* Footer navigation                                                */}
          {/* -------------------------------------------------------------- */}
          <Stack
            direction="row"
            spacing={2}
            justifyContent="flex-end"
            sx={{ mt: 2 }}
          >
            <Button
              variant="plain"
              color="neutral"
              size="sm"
              onClick={() => navigate('/email-marketing/templates')}
            >
              Administrar listas de contactos
            </Button>
            <Button
              variant="plain"
              color="primary"
              size="sm"
              onClick={() => navigate('/email-marketing/campaigns')}
            >
              Ver todas las campanas
            </Button>
          </Stack>
        </>
      )}
    </Container>
  )
}
