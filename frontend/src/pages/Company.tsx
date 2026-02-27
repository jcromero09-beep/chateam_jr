import { useState, useEffect } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Grid,
  Button,
  IconButton as _IconButton,
  Chip,
  Input,
  Select,
  Option,
  FormControl,
  FormLabel,
  Textarea as _Textarea,
  Divider,
  LinearProgress,
  Avatar,
  Switch,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Alert,
} from '@mui/joy'
import {
  Business as BusinessIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Upload as UploadIcon,
  People as PeopleIcon,
  LocationOn as LocationIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Language as LanguageIcon,
  Schedule as ScheduleIcon,
  Notifications as NotificationsIcon,
  Security as _SecurityIcon,
  Payment as PaymentIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material'

/**
 * Interface for Company data structure
 */
interface Company {
  id: number
  name: string
  legalName: string
  taxId: string
  industry: string
  size: string
  website?: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  country: string
  postalCode: string
  timezone: string
  language: string
  currency: string
  logo?: string
  settings: {
    workingHours: {
      enabled: boolean
      start: string
      end: string
      days: string[]
    }
    notifications: {
      email: boolean
      sms: boolean
      push: boolean
    }
    security: {
      twoFactor: boolean
      sessionTimeout: number
      passwordExpiry: number
    }
    integrations: {
      whatsapp: boolean
      telegram: boolean
      email: boolean
      stripe: boolean
    }
  }
  stats: {
    users: number
    activeUsers: number
    tickets: number
    campaigns: number
  }
  createdAt: string
  updatedAt: string
}

/**
 * Company Configuration Module
 * Complete company settings and team management
 *
 * Features:
 * - Company profile editing
 * - Logo upload
 * - Contact information
 * - Location settings
 * - Timezone and language
 * - Working hours configuration
 * - Notification preferences
 * - Security settings
 * - Integration status
 * - Team statistics
 */
export default function Company() {
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [formData, setFormData] = useState<Partial<Company>>({})

  useEffect(() => {
    fetchCompanyData()
  }, [])

  const fetchCompanyData = async () => {
    setLoading(true)
    try {
      // In production, replace with actual API call
      // const response = await api.get('/company')
      // setCompany(response.data)

      // Mock data
      const mockCompany: Company = {
        id: 1,
        name: 'JR Chateam',
        legalName: 'JR Chateam Solutions S.A.',
        taxId: 'B12345678',
        industry: 'Technology',
        size: '10-50',
        website: 'https://jrchateam.com',
        email: 'contact@jrchateam.com',
        phone: '+34 912 345 678',
        address: 'Calle Gran Vía 123',
        city: 'Madrid',
        state: 'Madrid',
        country: 'España',
        postalCode: '28013',
        timezone: 'Europe/Madrid',
        language: 'es',
        currency: 'EUR',
        logo: '/assets/logo.png',
        settings: {
          workingHours: {
            enabled: true,
            start: '09:00',
            end: '18:00',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          },
          notifications: {
            email: true,
            sms: true,
            push: true,
          },
          security: {
            twoFactor: true,
            sessionTimeout: 30,
            passwordExpiry: 90,
          },
          integrations: {
            whatsapp: true,
            telegram: true,
            email: true,
            stripe: true,
          },
        },
        stats: {
          users: 15,
          activeUsers: 12,
          tickets: 234,
          campaigns: 18,
        },
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2025-01-10T15:30:00Z',
      }

      setCompany(mockCompany)
      setFormData(mockCompany)
    } catch (error) {
      console.error('Error fetching company data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // await api.put('/company', formData)
      setCompany(formData as Company)
      setEditMode(false)
      alert('Cambios guardados exitosamente')
    } catch (error) {
      console.error('Error saving company data:', error)
      alert('Error al guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData(company || {})
    setEditMode(false)
  }

  const handleLogoUpload = () => {
    // In production, implement file upload
    alert('Funcionalidad de subida de logo próximamente')
  }

  if (loading || !company) {
    return (
      <Container maxWidth="xl">
        <LinearProgress />
      </Container>
    )
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <BusinessIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Empresa</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Configuración de empresa y equipo
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            {editMode ? (
              <>
                <Button variant="outlined" color="neutral" onClick={handleCancel}>
                  Cancelar
                </Button>
                <Button
                  startDecorator={<SaveIcon />}
                  color="primary"
                  onClick={handleSave}
                  loading={saving}
                >
                  Guardar Cambios
                </Button>
              </>
            ) : (
              <Button startDecorator={<EditIcon />} color="primary" onClick={() => setEditMode(true)}>
                Editar
              </Button>
            )}
          </Stack>
        </Stack>

        {/* Statistics Cards */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Usuarios
                    </Typography>
                    <Typography level="h2">{company.stats.users}</Typography>
                    <Chip size="sm" color="success" variant="soft" sx={{ mt: 1 }}>
                      {company.stats.activeUsers} activos
                    </Chip>
                  </Box>
                  <PeopleIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Tickets
                    </Typography>
                    <Typography level="h2">{company.stats.tickets}</Typography>
                    <Chip size="sm" color="primary" variant="soft" sx={{ mt: 1 }}>
                      Este mes
                    </Chip>
                  </Box>
                  <CheckIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Campañas
                    </Typography>
                    <Typography level="h2">{company.stats.campaigns}</Typography>
                    <Chip size="sm" color="warning" variant="soft" sx={{ mt: 1 }}>
                      Activas
                    </Chip>
                  </Box>
                  <NotificationsIcon sx={{ fontSize: 48, color: 'warning.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Integraciones
                    </Typography>
                    <Typography level="h2">
                      {Object.values(company.settings.integrations).filter(Boolean).length}
                    </Typography>
                    <Chip size="sm" color="success" variant="soft" sx={{ mt: 1 }}>
                      Activas
                    </Chip>
                  </Box>
                  <CheckIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabs */}
        <Card>
          <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value as number)}>
            <TabList>
              <Tab>Información General</Tab>
              <Tab>Configuración</Tab>
              <Tab>Seguridad</Tab>
              <Tab>Integraciones</Tab>
            </TabList>

            {/* Tab 1: General Information */}
            <TabPanel value={0}>
              <Stack spacing={3}>
                <Box>
                  <Typography level="h4" sx={{ mb: 2 }}>
                    Perfil de Empresa
                  </Typography>

                  {/* Logo */}
                  <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 3 }}>
                    <Avatar src={company.logo} sx={{ width: 100, height: 100 }}>
                      <BusinessIcon sx={{ fontSize: 48 }} />
                    </Avatar>
                    {editMode && (
                      <Button
                        variant="outlined"
                        startDecorator={<UploadIcon />}
                        onClick={handleLogoUpload}
                      >
                        Cambiar Logo
                      </Button>
                    )}
                  </Stack>

                  <Grid container spacing={2}>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Nombre Comercial *</FormLabel>
                        <Input
                          value={formData.name || ''}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          disabled={!editMode}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Razón Social *</FormLabel>
                        <Input
                          value={formData.legalName || ''}
                          onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                          disabled={!editMode}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>NIF/CIF *</FormLabel>
                        <Input
                          value={formData.taxId || ''}
                          onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                          disabled={!editMode}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Industria</FormLabel>
                        <Select
                          value={formData.industry}
                          onChange={(_, value) => setFormData({ ...formData, industry: value as string })}
                          disabled={!editMode}
                        >
                          <Option value="Technology">Tecnología</Option>
                          <Option value="Retail">Retail</Option>
                          <Option value="Healthcare">Salud</Option>
                          <Option value="Finance">Finanzas</Option>
                          <Option value="Education">Educación</Option>
                          <Option value="Other">Otro</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Tamaño de Empresa</FormLabel>
                        <Select
                          value={formData.size}
                          onChange={(_, value) => setFormData({ ...formData, size: value as string })}
                          disabled={!editMode}
                        >
                          <Option value="1-10">1-10 empleados</Option>
                          <Option value="10-50">10-50 empleados</Option>
                          <Option value="50-200">50-200 empleados</Option>
                          <Option value="200+">200+ empleados</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Sitio Web</FormLabel>
                        <Input
                          value={formData.website || ''}
                          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                          disabled={!editMode}
                          placeholder="https://ejemplo.com"
                        />
                      </FormControl>
                    </Grid>
                  </Grid>
                </Box>

                <Divider />

                <Box>
                  <Typography level="h4" sx={{ mb: 2 }}>
                    Información de Contacto
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Email *</FormLabel>
                        <Input
                          type="email"
                          value={formData.email || ''}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          disabled={!editMode}
                          startDecorator={<EmailIcon />}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Teléfono *</FormLabel>
                        <Input
                          value={formData.phone || ''}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          disabled={!editMode}
                          startDecorator={<PhoneIcon />}
                        />
                      </FormControl>
                    </Grid>
                  </Grid>
                </Box>

                <Divider />

                <Box>
                  <Typography level="h4" sx={{ mb: 2 }}>
                    Ubicación
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid xs={12}>
                      <FormControl>
                        <FormLabel>Dirección</FormLabel>
                        <Input
                          value={formData.address || ''}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          disabled={!editMode}
                          startDecorator={<LocationIcon />}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Ciudad</FormLabel>
                        <Input
                          value={formData.city || ''}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          disabled={!editMode}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Provincia/Estado</FormLabel>
                        <Input
                          value={formData.state || ''}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          disabled={!editMode}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>País</FormLabel>
                        <Input
                          value={formData.country || ''}
                          onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                          disabled={!editMode}
                        />
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={6}>
                      <FormControl>
                        <FormLabel>Código Postal</FormLabel>
                        <Input
                          value={formData.postalCode || ''}
                          onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                          disabled={!editMode}
                        />
                      </FormControl>
                    </Grid>
                  </Grid>
                </Box>

                <Divider />

                <Box>
                  <Typography level="h4" sx={{ mb: 2 }}>
                    Preferencias Regionales
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid xs={12} md={4}>
                      <FormControl>
                        <FormLabel>Zona Horaria</FormLabel>
                        <Select
                          value={formData.timezone}
                          onChange={(_, value) => setFormData({ ...formData, timezone: value as string })}
                          disabled={!editMode}
                          startDecorator={<ScheduleIcon />}
                        >
                          <Option value="Europe/Madrid">Europa/Madrid (GMT+1)</Option>
                          <Option value="America/New_York">América/Nueva York (GMT-5)</Option>
                          <Option value="America/Mexico_City">América/Ciudad de México (GMT-6)</Option>
                          <Option value="America/Sao_Paulo">América/São Paulo (GMT-3)</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={4}>
                      <FormControl>
                        <FormLabel>Idioma</FormLabel>
                        <Select
                          value={formData.language}
                          onChange={(_, value) => setFormData({ ...formData, language: value as string })}
                          disabled={!editMode}
                          startDecorator={<LanguageIcon />}
                        >
                          <Option value="es">Español</Option>
                          <Option value="en">English</Option>
                          <Option value="pt">Português</Option>
                          <Option value="fr">Français</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} md={4}>
                      <FormControl>
                        <FormLabel>Moneda</FormLabel>
                        <Select
                          value={formData.currency}
                          onChange={(_, value) => setFormData({ ...formData, currency: value as string })}
                          disabled={!editMode}
                          startDecorator={<PaymentIcon />}
                        >
                          <Option value="EUR">EUR (€)</Option>
                          <Option value="USD">USD ($)</Option>
                          <Option value="GBP">GBP (£)</Option>
                          <Option value="MXN">MXN ($)</Option>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </Box>
              </Stack>
            </TabPanel>

            {/* Tab 2: Configuration */}
            <TabPanel value={1}>
              <Stack spacing={3}>
                <Box>
                  <Typography level="h4" sx={{ mb: 2 }}>
                    Horario Laboral
                  </Typography>
                  <Alert color="primary" startDecorator={<InfoIcon />} sx={{ mb: 2 }}>
                    Configure el horario de atención de su empresa para gestionar tickets automáticamente.
                  </Alert>
                  <Stack spacing={2}>
                    <FormControl>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <FormLabel>Habilitar Horario Laboral</FormLabel>
                        <Switch
                          checked={formData.settings?.workingHours?.enabled || false}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              settings: {
                                ...formData.settings!,
                                workingHours: {
                                  ...formData.settings!.workingHours,
                                  enabled: e.target.checked,
                                },
                              },
                            })
                          }
                          disabled={!editMode}
                        />
                      </Stack>
                    </FormControl>
                    <Grid container spacing={2}>
                      <Grid xs={6}>
                        <FormControl>
                          <FormLabel>Hora de Inicio</FormLabel>
                          <Input
                            type="time"
                            value={formData.settings?.workingHours?.start || ''}
                            disabled={!editMode}
                          />
                        </FormControl>
                      </Grid>
                      <Grid xs={6}>
                        <FormControl>
                          <FormLabel>Hora de Fin</FormLabel>
                          <Input
                            type="time"
                            value={formData.settings?.workingHours?.end || ''}
                            disabled={!editMode}
                          />
                        </FormControl>
                      </Grid>
                    </Grid>
                  </Stack>
                </Box>

                <Divider />

                <Box>
                  <Typography level="h4" sx={{ mb: 2 }}>
                    Notificaciones
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl>
                      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                        <Box>
                          <FormLabel>Notificaciones por Email</FormLabel>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Recibir notificaciones importantes por correo electrónico
                          </Typography>
                        </Box>
                        <Switch
                          checked={formData.settings?.notifications?.email || false}
                          disabled={!editMode}
                        />
                      </Stack>
                    </FormControl>
                    <FormControl>
                      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                        <Box>
                          <FormLabel>Notificaciones SMS</FormLabel>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Recibir alertas urgentes por mensaje de texto
                          </Typography>
                        </Box>
                        <Switch
                          checked={formData.settings?.notifications?.sms || false}
                          disabled={!editMode}
                        />
                      </Stack>
                    </FormControl>
                    <FormControl>
                      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                        <Box>
                          <FormLabel>Notificaciones Push</FormLabel>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Recibir notificaciones en tiempo real en el navegador
                          </Typography>
                        </Box>
                        <Switch
                          checked={formData.settings?.notifications?.push || false}
                          disabled={!editMode}
                        />
                      </Stack>
                    </FormControl>
                  </Stack>
                </Box>
              </Stack>
            </TabPanel>

            {/* Tab 3: Security */}
            <TabPanel value={2}>
              <Stack spacing={3}>
                <Alert color="warning" startDecorator={<WarningIcon />}>
                  La configuración de seguridad afecta a todos los usuarios de la empresa.
                </Alert>

                <Box>
                  <Typography level="h4" sx={{ mb: 2 }}>
                    Autenticación
                  </Typography>
                  <Stack spacing={2}>
                    <FormControl>
                      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                        <Box>
                          <FormLabel>Autenticación de Dos Factores (2FA)</FormLabel>
                          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                            Requerir verificación adicional al iniciar sesión
                          </Typography>
                        </Box>
                        <Switch
                          checked={formData.settings?.security?.twoFactor || false}
                          disabled={!editMode}
                        />
                      </Stack>
                    </FormControl>
                    <FormControl>
                      <FormLabel>Tiempo de Expiración de Sesión (minutos)</FormLabel>
                      <Input
                        type="number"
                        value={formData.settings?.security?.sessionTimeout || 30}
                        disabled={!editMode}
                        slotProps={{ input: { min: 5, max: 480 } }}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Caducidad de Contraseña (días)</FormLabel>
                      <Input
                        type="number"
                        value={formData.settings?.security?.passwordExpiry || 90}
                        disabled={!editMode}
                        slotProps={{ input: { min: 30, max: 365 } }}
                      />
                    </FormControl>
                  </Stack>
                </Box>
              </Stack>
            </TabPanel>

            {/* Tab 4: Integrations */}
            <TabPanel value={3}>
              <Stack spacing={3}>
                <Alert color="success" startDecorator={<CheckIcon />}>
                  {Object.values(company.settings.integrations).filter(Boolean).length} de 4 integraciones activas
                </Alert>

                <Grid container spacing={2}>
                  <Grid xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography level="title-md">WhatsApp Business</Typography>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                              API oficial de Meta
                            </Typography>
                          </Box>
                          <Chip
                            color={company.settings.integrations.whatsapp ? 'success' : 'neutral'}
                            startDecorator={company.settings.integrations.whatsapp ? <CheckIcon /> : undefined}
                          >
                            {company.settings.integrations.whatsapp ? 'Activa' : 'Inactiva'}
                          </Chip>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography level="title-md">Telegram</Typography>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                              Bot API de Telegram
                            </Typography>
                          </Box>
                          <Chip
                            color={company.settings.integrations.telegram ? 'success' : 'neutral'}
                            startDecorator={company.settings.integrations.telegram ? <CheckIcon /> : undefined}
                          >
                            {company.settings.integrations.telegram ? 'Activa' : 'Inactiva'}
                          </Chip>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography level="title-md">Email Marketing</Typography>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                              SendGrid / Amazon SES
                            </Typography>
                          </Box>
                          <Chip
                            color={company.settings.integrations.email ? 'success' : 'neutral'}
                            startDecorator={company.settings.integrations.email ? <CheckIcon /> : undefined}
                          >
                            {company.settings.integrations.email ? 'Activa' : 'Inactiva'}
                          </Chip>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography level="title-md">Stripe Payments</Typography>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                              Procesamiento de pagos
                            </Typography>
                          </Box>
                          <Chip
                            color={company.settings.integrations.stripe ? 'success' : 'neutral'}
                            startDecorator={company.settings.integrations.stripe ? <CheckIcon /> : undefined}
                          >
                            {company.settings.integrations.stripe ? 'Activa' : 'Inactiva'}
                          </Chip>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Stack>
            </TabPanel>
          </Tabs>
        </Card>

        {/* Footer Info */}
        <Card variant="soft">
          <CardContent>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Empresa creada el {new Date(company.createdAt).toLocaleDateString('es-ES')} • Última
              actualización: {new Date(company.updatedAt).toLocaleDateString('es-ES')}
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  )
}
