import { useState, useEffect } from 'react'
import {
  PlugsConnected,
  MagnifyingGlass,
  ArrowClockwise,
  CheckCircle,
  XCircle,
  WarningCircle,
  Power,
  Buildings,
  WhatsappLogo,
  TelegramLogo,
  FacebookLogo,
  InstagramLogo,
  MusicNote,
} from '@phosphor-icons/react'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const columns = ['Canal', 'Nombre', 'Número', 'Empresa', 'ID Emp.', 'Estado', 'Por Defecto', 'Última Actualización']

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

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'CONNECTED':
        return 'success'
      case 'DISCONNECTED':
      case 'TIMEOUT':
        return 'destructive'
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
        return <CheckCircle className="size-3.5" weight="fill" aria-hidden />
      case 'DISCONNECTED':
      case 'TIMEOUT':
        return <XCircle className="size-3.5" weight="fill" aria-hidden />
      case 'OPENING':
      case 'PAIRING':
        return <Power className="size-3.5" weight="fill" aria-hidden />
      default:
        return <WarningCircle className="size-3.5" weight="fill" aria-hidden />
    }
  }

  const getChannelIcon = (channel?: string) => {
    switch (channel) {
      case 'facebook':
        return <FacebookLogo className="size-5 text-[#1877f2]" weight="fill" aria-hidden />
      case 'instagram':
        return <InstagramLogo className="size-5 text-[#e4405f]" weight="fill" aria-hidden />
      case 'telegram':
        return <TelegramLogo className="size-5 text-[#0088cc]" weight="fill" aria-hidden />
      case 'tiktok':
        return <MusicNote className="size-5 text-foreground" weight="fill" aria-hidden />
      default:
        return <WhatsappLogo className="size-5 text-wa" weight="fill" aria-hidden />
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <PlugsConnected className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Todas las Conexiones
              </h1>
              <p className="text-sm text-muted-foreground">
                Vista global de todas las conexiones (Solo Super Admin)
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar"
            className="text-muted-foreground"
            onClick={fetchAllConnections}
          >
            <ArrowClockwise className="size-5" aria-hidden />
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/12 p-4 text-sm text-destructive-text">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Global" value={String(stats.total)} />
          <StatTile label="Conectadas" value={String(stats.connected)} tone="success" />
          <StatTile label="Desconectadas" value={String(stats.disconnected)} tone="destructive" />
          <StatTile label="Empresas" value={String(stats.companies)} />
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            placeholder="Buscar por nombre, número o empresa..."
            aria-label="Buscar conexiones"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        {/* Connections Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      Cargando todas las conexiones...
                    </td>
                  </tr>
                ) : filteredConnections.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      {error ? 'Sin acceso' : 'No se encontraron conexiones'}
                    </td>
                  </tr>
                ) : (
                  filteredConnections.map((connection) => (
                    <tr key={connection.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <span className="flex size-8 items-center justify-center">
                          {getChannelIcon(connection.channel)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {connection.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                        {connection.number || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="primary">
                          <Buildings className="size-3.5" aria-hidden />
                          {connection.company?.name || `Empresa ${connection.companyId}`}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{connection.companyId}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getStatusVariant(connection.status)}>
                          {getStatusIcon(connection.status)}
                          {connection.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={connection.isDefault ? 'success' : 'neutral'}>
                          {connection.isDefault ? 'Sí' : 'No'}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(connection.updatedAt).toLocaleString('es-ES')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
