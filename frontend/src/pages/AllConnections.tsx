import { useState, useEffect } from 'react'
import {
  Typography,
  Stack,
  Container,
  Card,
  CardContent,
  Box,
  Grid,
  Table,
  Sheet,
  Chip,
  IconButton,
  Input,
} from '@mui/joy'
import {
  Cable as ConnectionsIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CheckCircle as ConnectedIcon,
  Cancel as DisconnectedIcon,
  Error as ErrorIcon,
  PowerSettingsNew as PowerIcon,
  Facebook as FacebookIcon,
  Instagram as InstagramIcon,
  WhatsApp as WhatsAppIcon,
  Telegram as TelegramIcon,
  Business as CompanyIcon,
  MusicNote as MusicNoteIcon,
} from '@mui/icons-material'
import api from '../services/api'

interface Connection {
  id: number
  name: string
  status: string
  number?: string
  isDefault?: boolean
  channel?: string
  companyId: number
  company?: {
    id: number
    name: string
  }
  createdAt: string
  updatedAt: string
}

export default function AllConnections() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAllConnections()
  }, [])

  const fetchAllConnections = async () => {
    try {
      setLoading(true)
      setError(null)
      // Usar /whatsapp/all para obtener TODAS las conexiones (solo super admin)
      const response = await api.get('/whatsapp/all')
      console.log('All Connections API response:', response.data)
      const data = Array.isArray(response.data)
        ? response.data
        : (response.data.connections || response.data.whatsapps || [])
      setConnections(data)
    } catch (err: any) {
      console.error('Error fetching all connections:', err)
      if (err.response?.status === 403) {
        setError('No tienes permisos para ver todas las conexiones. Solo Super Admin.')
      } else {
        setError('Error al cargar las conexiones')
      }
      setConnections([])
    } finally {
      setLoading(false)
    }
  }

  const filteredConnections = connections.filter(
    (connection) =>
      connection.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (connection.number && connection.number.includes(searchTerm)) ||
      (connection.company?.name && connection.company.name.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Agrupar por empresa
  const companiesMap = new Map<number, string>()
  connections.forEach(c => {
    if (c.companyId && !companiesMap.has(c.companyId)) {
      companiesMap.set(c.companyId, c.company?.name || `Empresa ${c.companyId}`)
    }
  })

  const stats = {
    total: connections.length,
    connected: connections.filter((c) => c.status === 'CONNECTED').length,
    disconnected: connections.filter((c) => c.status === 'DISCONNECTED' || c.status === 'TIMEOUT').length,
    companies: companiesMap.size,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return 'success'
      case 'DISCONNECTED':
      case 'TIMEOUT':
        return 'danger'
      case 'OPENING':
      case 'PAIRING':
        return 'warning'
      case 'qrcode':
        return 'primary'
      default:
        return 'neutral'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return <ConnectedIcon />
      case 'DISCONNECTED':
      case 'TIMEOUT':
        return <DisconnectedIcon />
      case 'OPENING':
      case 'PAIRING':
        return <PowerIcon />
      default:
        return <ErrorIcon />
    }
  }

  const getChannelIcon = (channel?: string) => {
    switch (channel) {
      case 'facebook':
        return <FacebookIcon sx={{ color: '#1877F2' }} />
      case 'instagram':
        return <InstagramIcon sx={{ color: '#E4405F' }} />
      case 'telegram':
        return <TelegramIcon sx={{ color: '#0088CC' }} />
      case 'tiktok':
        return <MusicNoteIcon sx={{ color: '#000000' }} />
      default:
        return <WhatsAppIcon sx={{ color: '#25D366' }} />
    }
  }

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ConnectionsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Todas las Conexiones</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Vista global de todas las conexiones (Solo Super Admin)
              </Typography>
            </Box>
          </Stack>
          <IconButton variant="outlined" color="neutral" onClick={fetchAllConnections}>
            <RefreshIcon />
          </IconButton>
        </Stack>

        {/* Error Message */}
        {error && (
          <Card color="danger" variant="soft">
            <CardContent>
              <Typography level="body-md" sx={{ color: 'danger.700' }}>
                {error}
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Total Global</Typography>
                <Typography level="h2">{stats.total}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Conectadas</Typography>
                <Typography level="h2" sx={{ color: 'success.main' }}>{stats.connected}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography level="body-sm" sx={{ mb: 1 }}>Desconectadas</Typography>
                <Typography level="h2" sx={{ color: 'danger.main' }}>{stats.disconnected}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center">
                  <CompanyIcon sx={{ color: 'primary.main' }} />
                  <Typography level="body-sm">Empresas</Typography>
                </Stack>
                <Typography level="h2">{stats.companies}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search */}
        <Card>
          <CardContent>
            <Input
              placeholder="Buscar por nombre, número o empresa..."
              startDecorator={<SearchIcon />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* Connections Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Canal</th>
                  <th style={{ width: 200 }}>Nombre</th>
                  <th style={{ width: 150 }}>Número</th>
                  <th style={{ width: 200 }}>Empresa</th>
                  <th style={{ width: 80 }}>ID Emp.</th>
                  <th style={{ width: 120 }}>Estado</th>
                  <th style={{ width: 100 }}>Por Defecto</th>
                  <th style={{ width: 180 }}>Última Actualización</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando todas las conexiones...</Typography>
                    </td>
                  </tr>
                ) : filteredConnections.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>
                        {error ? 'Sin acceso' : 'No se encontraron conexiones'}
                      </Typography>
                    </td>
                  </tr>
                ) : (
                  filteredConnections.map((connection) => (
                    <tr key={connection.id}>
                      <td>
                        <IconButton size="sm" variant="plain" color="neutral">
                          {getChannelIcon(connection.channel)}
                        </IconButton>
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          {connection.name}
                        </Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">{connection.number || '-'}</Typography>
                      </td>
                      <td>
                        <Chip size="sm" variant="soft" color="primary" startDecorator={<CompanyIcon />}>
                          {connection.company?.name || `Empresa ${connection.companyId}`}
                        </Chip>
                      </td>
                      <td>
                        <Chip size="sm" variant="outlined">
                          {connection.companyId}
                        </Chip>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getStatusColor(connection.status)}
                          startDecorator={getStatusIcon(connection.status)}
                        >
                          {connection.status}
                        </Chip>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={connection.isDefault ? 'success' : 'neutral'}
                          variant="soft"
                        >
                          {connection.isDefault ? 'Sí' : 'No'}
                        </Chip>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {new Date(connection.updatedAt).toLocaleString('es-ES')}
                        </Typography>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>
      </Stack>
    </Container>
  )
}
