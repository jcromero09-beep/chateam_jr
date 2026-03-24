/**
 * CommentAutoReplySettings — Configuración del sistema de Auto-Respuesta de Comentarios
 * Ruta: /comment-autoreply/settings
 */
import { useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  Button,
  Chip,
  Alert,
  Textarea,
  Divider,
  Sheet,
  IconButton,
} from '@mui/joy'
import {
  Settings as SettingsIcon,
  ContentCopy as CopyIcon,
  CheckCircle as CheckIcon,
  Webhook as WebhookIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon,
  Info as InfoIcon,
  Link as LinkIcon,
  Speed as SpeedIcon,
  Lock as LockIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

const devLog = (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args) }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BACKEND_URL = import.meta.env.VITE_API_URL || 'https://appro.chateam.ws'
const WEBHOOK_URL = `${BACKEND_URL}/webhook/facebook`
const VERIFY_TOKEN_PLACEHOLDER = 'Configurado en WEBHOOK_VERIFY_TOKEN (.env)'

const REQUIRED_PERMISSIONS = [
  { name: 'pages_manage_metadata', desc: 'Gestionar metadatos de la página' },
  { name: 'pages_read_engagement', desc: 'Leer comentarios y reacciones' },
  { name: 'pages_manage_engagement', desc: 'Responder, ocultar, eliminar comentarios' },
  { name: 'pages_messaging', desc: 'Enviar mensajes privados (DM)' },
  { name: 'public_profile', desc: 'Acceso básico al perfil público' },
]

const META_RATE_LIMITS = [
  { action: 'Respuestas de comentarios', limit: '200 por hora por página' },
  { action: 'Mensajes privados (DM)', limit: '1000 por día por página' },
  { action: 'Ocultar comentarios', limit: 'Sin límite documentado' },
  { action: 'Eliminar comentarios', limit: 'Sin límite documentado' },
  { action: 'Dar likes', limit: 'Sin límite documentado' },
]

// ─── Copy To Clipboard ────────────────────────────────────────────────────────

function CopyableCode({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      devLog('[CommentAutoReplySettings] copied', value)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback silencioso
    }
  }

  return (
    <Stack direction="row" alignItems="center" gap={1}>
      {label && (
        <Typography level="body-xs" sx={{ color: 'text.secondary', minWidth: 120 }}>
          {label}
        </Typography>
      )}
      <Sheet
        variant="soft"
        sx={{
          flex: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: 'sm',
          fontFamily: 'monospace',
          fontSize: 13,
          wordBreak: 'break-all',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography level="body-xs" sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.primary' }}>
          {value}
        </Typography>
        <IconButton
          size="sm"
          variant="plain"
          color={copied ? 'success' : 'neutral'}
          onClick={handleCopy}
          title={copied ? 'Copiado' : 'Copiar'}
        >
          {copied ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
        </IconButton>
      </Sheet>
    </Stack>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  title: string
  subtitle?: string
  children: React.ReactNode
}

function SectionCard({ icon, iconColor, iconBg, title, subtitle, children }: SectionCardProps) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="flex-start" gap={1.5} mb={2}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              background: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: iconColor,
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography level="title-sm" fontWeight={700}>{title}</Typography>
            {subtitle && (
              <Typography level="body-xs" sx={{ color: 'text.secondary' }}>{subtitle}</Typography>
            )}
          </Box>
        </Stack>
        <Divider sx={{ mb: 2 }} />
        {children}
      </CardContent>
    </Card>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommentAutoReplySettings() {
  const navigate = useNavigate()
  const [offensiveWords, setOffensiveWords] = useState(
    'spam, fraude, estafa, publicidad no solicitada'
  )
  const [saved, setSaved] = useState(false)

  const handleSaveGlobal = () => {
    // En producción esto llamaría a la API
    devLog('[CommentAutoReplySettings] saving global config', { offensiveWords })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" gap={1.5} mb={3}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: '12px',
            background: 'rgba(59,130,246,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SettingsIcon sx={{ color: '#3b82f6', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography level="h3" fontWeight={700}>
            Configuración de Auto-Responder
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
            Ajustes globales del sistema de comentarios automatizados
          </Typography>
        </Box>
      </Stack>

      <Stack gap={2.5}>
        {/* ── Páginas Conectadas ── */}
        <SectionCard
          icon={<FacebookIcon fontSize="small" />}
          iconColor="#1877f2"
          iconBg="rgba(24,119,242,0.12)"
          title="Páginas Conectadas"
          subtitle="Páginas de Facebook e Instagram autorizadas para el auto-respondedor"
        >
          <Alert
            color="primary"
            variant="soft"
            startDecorator={<InfoIcon />}
            sx={{ mb: 2 }}
          >
            Para conectar páginas de Facebook o Instagram, primero debes agregar la cuenta de
            red social en{' '}
            <Typography
              component="span"
              level="body-sm"
              sx={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => navigate('/connections')}
            >
              Canales / Conexiones
            </Typography>
            {' '}y otorgar los permisos necesarios mediante el flujo de Embedded Signup.
          </Alert>

          <Typography level="title-sm" fontWeight={600} sx={{ mb: 1.5 }}>
            Permisos Requeridos en Meta App
          </Typography>
          <Stack gap={1} sx={{ mb: 2 }}>
            {REQUIRED_PERMISSIONS.map(perm => (
              <Stack key={perm.name} direction="row" alignItems="flex-start" gap={1.5}>
                <CheckIcon sx={{ fontSize: 18, color: '#52b788', mt: 0.1 }} />
                <Box>
                  <Typography level="body-xs" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#3b82f6' }}>
                    {perm.name}
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                    {perm.desc}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Typography level="title-sm" fontWeight={600} sx={{ mb: 1.5 }}>
            Plataformas Soportadas
          </Typography>
          <Stack direction="row" gap={2}>
            <Stack direction="row" alignItems="center" gap={1}>
              <FacebookIcon sx={{ color: '#1877f2', fontSize: 22 }} />
              <Box>
                <Typography level="body-sm" fontWeight={600}>Facebook</Typography>
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Posts y Páginas</Typography>
              </Box>
              <Chip size="sm" variant="soft" color="success" sx={{ ml: 1 }}>Soportado</Chip>
            </Stack>
            <Stack direction="row" alignItems="center" gap={1}>
              <InstagramIcon sx={{ color: '#e1306c', fontSize: 22 }} />
              <Box>
                <Typography level="body-sm" fontWeight={600}>Instagram</Typography>
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Cuentas de Negocio</Typography>
              </Box>
              <Chip size="sm" variant="soft" color="success" sx={{ ml: 1 }}>Soportado</Chip>
            </Stack>
          </Stack>
        </SectionCard>

        {/* ── Webhook Configuration ── */}
        <SectionCard
          icon={<WebhookIcon fontSize="small" />}
          iconColor="#7c3aed"
          iconBg="rgba(124,58,237,0.12)"
          title="Configuracion del Webhook"
          subtitle="URL y token para recibir eventos de comentarios desde Meta"
        >
          <Stack gap={2}>
            <Box>
              <Typography level="title-sm" fontWeight={600} sx={{ mb: 1 }}>
                URL del Webhook
              </Typography>
              <CopyableCode value={WEBHOOK_URL} />
            </Box>

            <Box>
              <Typography level="title-sm" fontWeight={600} sx={{ mb: 1 }}>
                Token de Verificacion
              </Typography>
              <Stack direction="row" alignItems="center" gap={1}>
                <LockIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography level="body-xs" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                  {VERIFY_TOKEN_PLACEHOLDER}
                </Typography>
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Stack direction="row" alignItems="center" gap={1} mb={1.5}>
                <LinkIcon sx={{ fontSize: 18, color: '#3b82f6' }} />
                <Typography level="title-sm" fontWeight={600}>
                  Pasos para Configurar en Meta App Dashboard
                </Typography>
              </Stack>
              <Stack gap={1.5}>
                {[
                  'Accede a developers.facebook.com y abre tu App',
                  'Ve a Webhooks en el panel izquierdo',
                  'Haz clic en "Agregar suscripcion" para el objeto "Page"',
                  `Ingresa la URL del webhook: ${WEBHOOK_URL}`,
                  'Ingresa el token de verificacion configurado en WEBHOOK_VERIFY_TOKEN',
                  'Suscribete a los campos: feed, messages, messaging_optins',
                  'Guarda y verifica que el webhook responda con HTTP 200',
                  'Repite el proceso para el objeto "Instagram" si usas esa plataforma',
                ].map((step, idx) => (
                  <Stack key={idx} direction="row" alignItems="flex-start" gap={1.5}>
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: '#3b82f6',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                        mt: 0.1,
                      }}
                    >
                      {idx + 1}
                    </Box>
                    <Typography level="body-xs" sx={{ color: 'text.secondary', lineHeight: 1.7, pt: 0.3 }}>
                      {step}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>

            <Alert color="warning" variant="soft" startDecorator={<InfoIcon />}>
              El webhook debe ser accesible publicamente (HTTPS). En desarrollo local usa ngrok
              o un tunel similar para exponer tu servidor.
            </Alert>
          </Stack>
        </SectionCard>

        {/* ── Configuracion Global ── */}
        <SectionCard
          icon={<SettingsIcon fontSize="small" />}
          iconColor="#52b788"
          iconBg="rgba(82,183,136,0.12)"
          title="Configuracion Global"
          subtitle="Ajustes aplicados a todas las campanas del sistema"
        >
          <Stack gap={2}>
            <Box>
              <Typography level="title-sm" fontWeight={600} sx={{ mb: 0.5 }}>
                Palabras Ofensivas Globales
              </Typography>
              <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 1 }}>
                Lista base de palabras ofensivas aplicada a todas las campanas que tengan
                habilitado el filtro de moderacion. Cada campana puede agregar sus propias
                palabras adicionales.
              </Typography>
              <Textarea
                minRows={3}
                placeholder="palabra1, palabra2, frase ofensiva"
                value={offensiveWords}
                onChange={e => setOffensiveWords(e.target.value)}
              />
            </Box>

            {saved && (
              <Alert color="success" variant="soft" startDecorator={<CheckIcon />}>
                Configuracion guardada correctamente
              </Alert>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                onClick={handleSaveGlobal}
                sx={{ background: '#3b82f6', '&:hover': { background: '#2563eb' } }}
              >
                Guardar Configuracion Global
              </Button>
            </Box>
          </Stack>
        </SectionCard>

        {/* ── Rate Limits Info ── */}
        <SectionCard
          icon={<SpeedIcon fontSize="small" />}
          iconColor="#f3a43b"
          iconBg="rgba(243,164,59,0.12)"
          title="Limites de Rate de Meta API"
          subtitle="Limites oficiales de la API de Meta para operaciones de comentarios (solo lectura)"
        >
          <Alert color="neutral" variant="soft" startDecorator={<InfoIcon />} sx={{ mb: 2 }}>
            Estos limites son impuestos por Meta. ChatEAM incluye manejo automatico de
            reintentos y colas para no excederlos. Si se alcanza el limite, las respuestas
            se encolan y procesan cuando se libera cuota.
          </Alert>

          <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600 }}>
                    Accion
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600 }}>
                    Limite
                  </th>
                </tr>
              </thead>
              <tbody>
                {META_RATE_LIMITS.map((row, idx) => (
                  <tr
                    key={row.action}
                    style={{
                      borderTop: idx > 0 ? '1px solid rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>{row.action}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={row.limit.includes('Sin limite') ? 'success' : 'warning'}
                      >
                        {row.limit}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Sheet>

          <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 1.5, fontStyle: 'italic' }}>
            * Los limites pueden variar segun el nivel de acceso de tu App en Meta (desarrollo,
            produccion, avanzado). Consulta la documentacion oficial en developers.facebook.com
            para informacion actualizada.
          </Typography>
        </SectionCard>
      </Stack>
    </Box>
  )
}
