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
  IconButton,
  Tooltip,
  CircularProgress,
  Input,
  FormControl,
  FormLabel,
  Alert,
  Divider,
} from '@mui/joy'
import {
  Dns as SmtpIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Settings as SettingsIcon,
  Send as SendIcon,
  Info as InfoIcon,
  Save as SaveIcon,
  Email as EmailIcon,
} from '@mui/icons-material'
import { toast } from 'sonner'
import api from '../services/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailProviderConfig {
  id: number
  companyId: number
  provider: 'carbonio' | 'sendgrid' | 'mailgun' | 'amazon_ses'
  displayName: string
  isActive: boolean
  tier: number
  smtpHost?: string
  smtpPort?: number
  fromEmail?: string
  fromName?: string
  apiKey?: string
  domain?: string
  region?: string
  createdAt?: string
  updatedAt?: string
}

interface ProviderMeta {
  key: 'carbonio' | 'sendgrid' | 'mailgun' | 'amazon_ses'
  name: string
  description: string
  tier: number
  fields: ProviderField[]
}

interface ProviderField {
  name: string
  label: string
  type: 'text' | 'password' | 'number'
  required: boolean
  placeholder?: string
}

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

const PROVIDERS: ProviderMeta[] = [
  {
    key: 'carbonio',
    name: 'Carbonio (SMTP Interno)',
    description: 'Servidor SMTP integrado incluido en tu plan. Sin costo adicional. Ideal para volumenes bajos a medios.',
    tier: 0,
    fields: [],
  },
  {
    key: 'sendgrid',
    name: 'SendGrid',
    description: 'Servicio de email transaccional de Twilio. Alta entregabilidad y analiticas avanzadas.',
    tier: 1,
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'SG.xxxx...' },
      { name: 'fromEmail', label: 'Email Remitente', type: 'text', required: false, placeholder: 'noreply@tudominio.com' },
      { name: 'fromName', label: 'Nombre Remitente', type: 'text', required: false, placeholder: 'Mi Empresa' },
    ],
  },
  {
    key: 'mailgun',
    name: 'Mailgun',
    description: 'Plataforma de email para desarrolladores. Excelente para emails transaccionales y masivos.',
    tier: 1,
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'key-xxxx...' },
      { name: 'domain', label: 'Dominio', type: 'text', required: true, placeholder: 'mg.tudominio.com' },
      { name: 'fromEmail', label: 'Email Remitente', type: 'text', required: false, placeholder: 'noreply@tudominio.com' },
      { name: 'fromName', label: 'Nombre Remitente', type: 'text', required: false, placeholder: 'Mi Empresa' },
    ],
  },
  {
    key: 'amazon_ses',
    name: 'Amazon SES',
    description: 'Servicio de email de AWS. Bajo costo para alto volumen. Requiere configuracion de identidad.',
    tier: 1,
    fields: [
      { name: 'apiKey', label: 'Access Key ID', type: 'password', required: true, placeholder: 'AKIA...' },
      { name: 'domain', label: 'Secret Access Key', type: 'password', required: true, placeholder: 'wJalr...' },
      { name: 'region', label: 'Region AWS', type: 'text', required: true, placeholder: 'us-east-1' },
      { name: 'fromEmail', label: 'Email Verificado', type: 'text', required: false, placeholder: 'noreply@tudominio.com' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ChipColor = 'success' | 'danger' | 'neutral'

function statusColor(isActive: boolean | undefined, isConfigured: boolean): ChipColor {
  if (isActive) return 'success'
  if (isConfigured) return 'neutral'
  return 'danger'
}

function statusLabel(isActive: boolean | undefined, isConfigured: boolean): string {
  if (isActive) return 'Activo'
  if (isConfigured) return 'Inactivo'
  return 'No configurado'
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EmailProviderSettings() {
  const [configs, setConfigs] = useState<EmailProviderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [savingProvider, setSavingProvider] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({})

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchConfigs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/email-provider-configs')
      const raw: EmailProviderConfig[] = Array.isArray(data)
        ? data
        : (data?.data ?? data?.configs ?? [])
      setConfigs(raw)

      // Initialize form data from existing configs
      const initial: Record<string, Record<string, string>> = {}
      for (const cfg of raw) {
        initial[cfg.provider] = {
          apiKey: cfg.apiKey ?? '',
          domain: cfg.domain ?? '',
          region: cfg.region ?? '',
          fromEmail: cfg.fromEmail ?? '',
          fromName: cfg.fromName ?? '',
        }
      }
      setFormData(initial)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar configuraciones'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const getConfigFor = (provider: string): EmailProviderConfig | undefined => {
    return configs.find(c => c.provider === provider)
  }

  const getFormValues = (provider: string): Record<string, string> => {
    return formData[provider] ?? {}
  }

  const updateFormField = (provider: string, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [provider]: {
        ...(prev[provider] ?? {}),
        [field]: value,
      },
    }))
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleSave = async (providerKey: string) => {
    setSavingProvider(providerKey)
    try {
      const existing = getConfigFor(providerKey)
      const values = getFormValues(providerKey)

      if (existing) {
        await api.put(`/email-provider-configs/${existing.id}`, {
          ...values,
          provider: providerKey,
        })
      } else {
        await api.post('/email-provider-configs', {
          ...values,
          provider: providerKey,
        })
      }

      toast.success(`Configuracion de ${providerKey} guardada correctamente`)
      await fetchConfigs()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar configuracion'
      toast.error(message)
    } finally {
      setSavingProvider(null)
    }
  }

  const handleTest = async (providerKey: string) => {
    setTestingProvider(providerKey)
    try {
      const existing = getConfigFor(providerKey)
      const endpoint = existing
        ? `/email-provider-configs/${existing.id}/test`
        : '/email-provider-configs/test'

      const payload = existing ? {} : { provider: providerKey, ...getFormValues(providerKey) }

      const { data } = await api.post(endpoint, payload)

      if (data?.success) {
        toast.success(`Conexion con ${providerKey} exitosa`)
      } else {
        toast.error(data?.message ?? `Error al probar conexion con ${providerKey}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al probar conexion'
      toast.error(message)
    } finally {
      setTestingProvider(null)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>

      {/* Header */}
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
            <SmtpIcon sx={{ color: 'primary.plainColor', fontSize: 24 }} />
          </Box>
          <Box>
            <Typography level="h3" sx={{ fontWeight: 700 }}>
              Configuracion de Proveedores de Email
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
              Gestiona tus proveedores SMTP y servicios de envio de email
            </Typography>
          </Box>
        </Stack>

        <Tooltip title="Actualizar datos">
          <IconButton
            variant="outlined"
            color="neutral"
            onClick={fetchConfigs}
            disabled={loading}
            size="sm"
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Info card - Carbonio default */}
      <Alert
        variant="soft"
        color="primary"
        startDecorator={<InfoIcon />}
        sx={{ mb: 3, borderRadius: 'lg' }}
      >
        <Box>
          <Typography level="title-sm" sx={{ fontWeight: 600 }}>
            Carbonio es tu proveedor por defecto (Tier 0)
          </Typography>
          <Typography level="body-sm">
            Tu plan incluye un servidor SMTP Carbonio integrado sin costo adicional.
            Los proveedores Tier 1 (SendGrid, Mailgun, Amazon SES) ofrecen mayor entregabilidad
            y analiticas avanzadas para envios de alto volumen.
          </Typography>
        </Box>
      </Alert>

      {/* Loading state */}
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
              Cargando configuraciones...
            </Typography>
          </Stack>
        </Box>
      ) : error ? (
        /* Error state */
        <Card variant="outlined" sx={{ borderRadius: 'lg', textAlign: 'center', py: 6 }}>
          <CardContent>
            <CancelIcon sx={{ fontSize: 52, color: 'danger.plainColor', mb: 2 }} />
            <Typography level="body-md" sx={{ color: 'text.secondary', mb: 2 }}>
              {error}
            </Typography>
            <Button
              variant="outlined"
              color="neutral"
              size="sm"
              onClick={fetchConfigs}
              startDecorator={<RefreshIcon fontSize="small" />}
            >
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Provider cards grid */
        <Grid container spacing={2.5}>
          {PROVIDERS.map((provider) => {
            const existing = getConfigFor(provider.key)
            const isConfigured = !!existing
            const isActive = existing?.isActive ?? (provider.key === 'carbonio')
            const isCarbonio = provider.key === 'carbonio'
            const values = getFormValues(provider.key)

            return (
              <Grid xs={12} md={6} key={provider.key}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 'lg',
                    boxShadow: 'sm',
                    height: '100%',
                    transition: 'box-shadow 0.2s, border-color 0.2s',
                    borderColor: isActive ? 'success.outlinedBorder' : 'divider',
                    '&:hover': { boxShadow: 'md' },
                  }}
                >
                  <CardContent>
                    {/* Card header */}
                    <Stack
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ mb: 2 }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 'md',
                            bgcolor: isActive ? 'success.softBg' : 'neutral.softBg',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isCarbonio ? (
                            <EmailIcon
                              sx={{
                                color: isActive ? 'success.plainColor' : 'neutral.plainColor',
                                fontSize: 22,
                              }}
                            />
                          ) : (
                            <SettingsIcon
                              sx={{
                                color: isActive ? 'success.plainColor' : 'neutral.plainColor',
                                fontSize: 22,
                              }}
                            />
                          )}
                        </Box>
                        <Box>
                          <Typography level="title-md" sx={{ fontWeight: 600 }}>
                            {provider.name}
                          </Typography>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={statusColor(isActive, isConfigured)}
                            startDecorator={
                              isActive ? (
                                <CheckCircleIcon sx={{ fontSize: 14 }} />
                              ) : undefined
                            }
                            sx={{ mt: 0.5 }}
                          >
                            {statusLabel(isActive, isConfigured)}
                          </Chip>
                        </Box>
                      </Stack>
                      <Chip size="sm" variant="outlined" color="neutral">
                        Tier {provider.tier}
                      </Chip>
                    </Stack>

                    <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 2 }}>
                      {provider.description}
                    </Typography>

                    <Divider sx={{ my: 1.5 }} />

                    {/* Carbonio - read-only info */}
                    {isCarbonio ? (
                      <Box>
                        <Typography level="body-xs" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                          Configuracion Actual
                        </Typography>
                        <Stack spacing={1}>
                          <Stack direction="row" justifyContent="space-between">
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              Host SMTP
                            </Typography>
                            <Typography level="body-xs" sx={{ fontWeight: 500 }}>
                              {existing?.smtpHost ?? 'mail.chateam.ws'}
                            </Typography>
                          </Stack>
                          <Stack direction="row" justifyContent="space-between">
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              Puerto
                            </Typography>
                            <Typography level="body-xs" sx={{ fontWeight: 500 }}>
                              {existing?.smtpPort ?? 587}
                            </Typography>
                          </Stack>
                          <Stack direction="row" justifyContent="space-between">
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              Remitente
                            </Typography>
                            <Typography level="body-xs" sx={{ fontWeight: 500 }}>
                              {existing?.fromEmail ?? 'noreply@chateam.ws'}
                            </Typography>
                          </Stack>
                        </Stack>
                        <Box sx={{ mt: 2 }}>
                          <Button
                            variant="outlined"
                            color="primary"
                            size="sm"
                            fullWidth
                            startDecorator={
                              testingProvider === 'carbonio' ? (
                                <CircularProgress size="sm" />
                              ) : (
                                <SendIcon fontSize="small" />
                              )
                            }
                            onClick={() => handleTest('carbonio')}
                            disabled={testingProvider === 'carbonio'}
                          >
                            {testingProvider === 'carbonio'
                              ? 'Probando conexion...'
                              : 'Probar Conexion'}
                          </Button>
                        </Box>
                      </Box>
                    ) : (
                      /* Tier 1 providers - configurable fields */
                      <Box>
                        <Typography level="body-xs" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1.5 }}>
                          Configuracion
                        </Typography>
                        <Stack spacing={1.5}>
                          {provider.fields.map((field) => (
                            <FormControl key={field.name} size="sm">
                              <FormLabel>
                                {field.label}
                                {field.required && (
                                  <Typography
                                    component="span"
                                    level="body-xs"
                                    sx={{ color: 'danger.plainColor', ml: 0.5 }}
                                  >
                                    *
                                  </Typography>
                                )}
                              </FormLabel>
                              <Input
                                size="sm"
                                type={field.type}
                                placeholder={field.placeholder}
                                value={values[field.name] ?? ''}
                                onChange={(e) =>
                                  updateFormField(provider.key, field.name, e.target.value)
                                }
                              />
                            </FormControl>
                          ))}
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                          <Button
                            variant="solid"
                            color="primary"
                            size="sm"
                            fullWidth
                            startDecorator={
                              savingProvider === provider.key ? (
                                <CircularProgress size="sm" />
                              ) : (
                                <SaveIcon fontSize="small" />
                              )
                            }
                            onClick={() => handleSave(provider.key)}
                            disabled={savingProvider === provider.key}
                          >
                            {savingProvider === provider.key ? 'Guardando...' : 'Guardar'}
                          </Button>
                          <Button
                            variant="outlined"
                            color="neutral"
                            size="sm"
                            fullWidth
                            startDecorator={
                              testingProvider === provider.key ? (
                                <CircularProgress size="sm" />
                              ) : (
                                <SendIcon fontSize="small" />
                              )
                            }
                            onClick={() => handleTest(provider.key)}
                            disabled={testingProvider === provider.key}
                          >
                            {testingProvider === provider.key ? 'Probando...' : 'Test'}
                          </Button>
                        </Stack>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}
    </Container>
  )
}
