import { useState, useEffect } from 'react'
import { LinearProgress } from '@mui/joy'
import {
  UsersThree,
  Plus,
  PencilSimple,
  Trash,
  EnvelopeSimple,
  WhatsappLogo,
  Phone,
  MagnifyingGlass,
  FunnelSimple,
  TrendUp,
  Star,
  ClipboardText,
  CurrencyDollar,
} from '@phosphor-icons/react'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'

/**
 * Interface for Lead data structure
 */
interface Lead {
  id: number
  name: string
  email: string
  phone: string
  company?: string
  position?: string
  source: string
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
  score: number
  value: number
  assignedTo?: string
  tags: string[]
  notes?: string
  lastContact?: string
  createdAt: string
  nextFollowUp?: string
}

const columns = [
  'Lead',
  'Empresa',
  'Fuente',
  'Estado',
  'Score',
  'Valor',
  'Tags',
  'Asignado',
  'Próximo',
  '',
]

// Mismo look que <Input> del design system, pero para <textarea> (alto libre).
const textareaClass =
  'min-h-[84px] w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

/**
 * Leads & CRM Module
 * Complete CRM system for managing leads with scoring, filtering, and quick actions
 *
 * Features:
 * - Lead table with advanced filtering
 * - 4 KPI cards with statistics
 * - Create/Edit lead modal
 * - Lead scoring with progress bar
 * - Colored tags and status badges
 * - Quick actions (email, WhatsApp, edit, delete)
 * - Search and filter capabilities
 * - Responsive design
 */
export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [openModal, setOpenModal] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [formData, setFormData] = useState<Partial<Lead>>({
    name: '',
    email: '',
    phone: '',
    company: '',
    position: '',
    source: 'website',
    status: 'new',
    score: 50,
    value: 0,
    tags: [],
    notes: '',
  })

  // Mock data for leads
  useEffect(() => {
    fetchLeads()
  }, [])

  const fetchLeads = async () => {
    setLoading(true)
    try {
      // In production, replace with actual API call
      // const response = await api.get('/leads')
      // setLeads(response.data)

      // Mock data
      const mockLeads: Lead[] = [
        {
          id: 1,
          name: 'María García',
          email: 'maria.garcia@empresa.com',
          phone: '+34 612 345 678',
          company: 'Tech Solutions SA',
          position: 'CEO',
          source: 'website',
          status: 'qualified',
          score: 85,
          value: 15000,
          assignedTo: 'Juan Pérez',
          tags: ['enterprise', 'hot'],
          notes: 'Interesada en plan enterprise. Seguimiento semanal.',
          lastContact: '2025-01-10',
          createdAt: '2025-01-05',
          nextFollowUp: '2025-01-15',
        },
        {
          id: 2,
          name: 'Carlos Rodríguez',
          email: 'carlos.r@startup.io',
          phone: '+34 623 456 789',
          company: 'Startup Innovate',
          position: 'CTO',
          source: 'referral',
          status: 'proposal',
          score: 92,
          value: 25000,
          assignedTo: 'Ana López',
          tags: ['tech', 'hot', 'decision-maker'],
          notes: 'Propuesta enviada el 08/01. Esperando respuesta.',
          lastContact: '2025-01-09',
          createdAt: '2025-01-02',
          nextFollowUp: '2025-01-13',
        },
        {
          id: 3,
          name: 'Laura Martínez',
          email: 'laura.m@comercio.com',
          phone: '+34 634 567 890',
          company: 'E-commerce Plus',
          position: 'Marketing Director',
          source: 'social',
          status: 'contacted',
          score: 68,
          value: 8000,
          assignedTo: 'Juan Pérez',
          tags: ['ecommerce', 'warm'],
          notes: 'Primera llamada realizada. Interés moderado.',
          lastContact: '2025-01-08',
          createdAt: '2025-01-07',
          nextFollowUp: '2025-01-14',
        },
        {
          id: 4,
          name: 'Roberto Sánchez',
          email: 'roberto@consulting.es',
          phone: '+34 645 678 901',
          company: 'Business Consulting',
          position: 'Partner',
          source: 'event',
          status: 'negotiation',
          score: 88,
          value: 35000,
          assignedTo: 'Ana López',
          tags: ['enterprise', 'hot', 'high-value'],
          notes: 'Negociación de precios. Muy interesado.',
          lastContact: '2025-01-11',
          createdAt: '2025-01-01',
          nextFollowUp: '2025-01-12',
        },
        {
          id: 5,
          name: 'Isabel Torres',
          email: 'isabel.torres@retail.com',
          phone: '+34 656 789 012',
          company: 'Retail Network',
          position: 'Operations Manager',
          source: 'website',
          status: 'new',
          score: 45,
          value: 5000,
          tags: ['retail', 'cold'],
          notes: 'Lead reciente. Pendiente primer contacto.',
          createdAt: '2025-01-11',
          nextFollowUp: '2025-01-16',
        },
        {
          id: 6,
          name: 'Fernando Ruiz',
          email: 'fernando@logistics.com',
          phone: '+34 667 890 123',
          company: 'Logistics Corp',
          position: 'Sales Director',
          source: 'linkedin',
          status: 'won',
          score: 95,
          value: 45000,
          assignedTo: 'Juan Pérez',
          tags: ['enterprise', 'won', 'referral-source'],
          notes: 'Cliente ganado. Contrato firmado el 10/01.',
          lastContact: '2025-01-10',
          createdAt: '2024-12-28',
        },
        {
          id: 7,
          name: 'Patricia Gómez',
          email: 'patricia@design.studio',
          phone: '+34 678 901 234',
          company: 'Creative Design Studio',
          position: 'Creative Director',
          source: 'referral',
          status: 'lost',
          score: 60,
          value: 7000,
          assignedTo: 'Ana López',
          tags: ['design', 'lost'],
          notes: 'Perdido por precio. Contactar en Q2.',
          lastContact: '2025-01-06',
          createdAt: '2024-12-20',
        },
        {
          id: 8,
          name: 'Miguel Fernández',
          email: 'miguel@restaurant.com',
          phone: '+34 689 012 345',
          company: 'Restaurant Chain',
          position: 'Owner',
          source: 'website',
          status: 'qualified',
          score: 72,
          value: 12000,
          assignedTo: 'Juan Pérez',
          tags: ['hospitality', 'warm'],
          notes: 'Calificado como prospect. Solicita demo.',
          lastContact: '2025-01-09',
          createdAt: '2025-01-04',
          nextFollowUp: '2025-01-15',
        },
        {
          id: 9,
          name: 'Carmen López',
          email: 'carmen@health.clinic',
          phone: '+34 690 123 456',
          company: 'Health Clinic Network',
          position: 'Administrator',
          source: 'google',
          status: 'contacted',
          score: 55,
          value: 9000,
          assignedTo: 'Ana López',
          tags: ['healthcare', 'warm'],
          notes: 'Contactada por email. Pendiente llamada.',
          lastContact: '2025-01-10',
          createdAt: '2025-01-08',
          nextFollowUp: '2025-01-17',
        },
        {
          id: 10,
          name: 'Antonio Morales',
          email: 'antonio@legal.firm',
          phone: '+34 601 234 567',
          company: 'Legal Associates',
          position: 'Managing Partner',
          source: 'event',
          status: 'proposal',
          score: 80,
          value: 18000,
          assignedTo: 'Juan Pérez',
          tags: ['legal', 'hot', 'high-value'],
          notes: 'Propuesta personalizada enviada.',
          lastContact: '2025-01-11',
          createdAt: '2025-01-03',
          nextFollowUp: '2025-01-14',
        },
      ]

      setLeads(mockLeads)
    } catch (error) {
      console.error('Error fetching leads:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calculate KPI statistics
  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === 'new').length,
    qualified: leads.filter((l) => l.status === 'qualified' || l.status === 'contacted').length,
    inProgress: leads.filter((l) => ['proposal', 'negotiation'].includes(l.status)).length,
    won: leads.filter((l) => l.status === 'won').length,
    totalValue: leads.reduce((acc, l) => acc + l.value, 0),
    avgScore: Math.round(leads.reduce((acc, l) => acc + l.score, 0) / leads.length),
    conversionRate: leads.length > 0 ? (leads.filter((l) => l.status === 'won').length / leads.length) * 100 : 0,
  }

  // Filter leads based on search and filters
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.includes(searchTerm)

    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
    const matchesSource = sourceFilter === 'all' || lead.source === sourceFilter

    return matchesSearch && matchesStatus && matchesSource
  })

  // Status configuration (variant = token del design system)
  const getStatusConfig = (status: string): { variant: BadgeProps['variant']; label: string } => {
    const configs: Record<string, { variant: BadgeProps['variant']; label: string }> = {
      new: { variant: 'neutral', label: 'Nuevo' },
      contacted: { variant: 'primary', label: 'Contactado' },
      qualified: { variant: 'success', label: 'Calificado' },
      proposal: { variant: 'warning', label: 'Propuesta' },
      negotiation: { variant: 'warning', label: 'Negociación' },
      won: { variant: 'success', label: 'Ganado' },
      lost: { variant: 'destructive', label: 'Perdido' },
    }
    return configs[status] || configs.new
  }

  // Get score color based on value (paleta Joy: la barra sigue siendo LinearProgress)
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'success'
    if (score >= 60) return 'primary'
    if (score >= 40) return 'warning'
    return 'danger'
  }

  // Tag chip variant
  const getTagVariant = (tag: string): BadgeProps['variant'] =>
    tag === 'hot' ? 'destructive' : tag === 'warm' ? 'warning' : 'outline'

  // Open modal for creating new lead
  const openCreateModal = () => {
    setEditingLead(null)
    setFormData({
      name: '',
      email: '',
      phone: '',
      company: '',
      position: '',
      source: 'website',
      status: 'new',
      score: 50,
      value: 0,
      tags: [],
      notes: '',
    })
    setOpenModal(true)
  }

  // Open modal for editing existing lead
  const openEditModal = (lead: Lead) => {
    setEditingLead(lead)
    setFormData(lead)
    setOpenModal(true)
  }

  // Handle form submission
  const handleSubmit = async () => {
    try {
      if (editingLead) {
        // Update existing lead
        // await api.put(`/leads/${editingLead.id}`, formData)
        setLeads(leads.map((l) => (l.id === editingLead.id ? { ...l, ...formData } as Lead : l)))
      } else {
        // Create new lead
        // await api.post('/leads', formData)
        const newLead: Lead = {
          ...formData,
          id: Math.max(...leads.map((l) => l.id)) + 1,
          createdAt: new Date().toISOString().split('T')[0],
        } as Lead
        setLeads([...leads, newLead])
      }
      setOpenModal(false)
      fetchLeads()
    } catch (error) {
      console.error('Error saving lead:', error)
    }
  }

  // Delete lead
  const handleDelete = async (leadId: number) => {
    if (confirm('¿Estás seguro de eliminar este lead?')) {
      try {
        // await api.delete(`/leads/${leadId}`)
        setLeads(leads.filter((l) => l.id !== leadId))
      } catch (error) {
        console.error('Error deleting lead:', error)
      }
    }
  }

  // Quick action handlers
  const handleEmail = (lead: Lead) => {
    window.location.href = `mailto:${lead.email}`
  }

  const handleWhatsApp = (lead: Lead) => {
    const phone = lead.phone.replace(/\s+/g, '')
    window.open(`https://wa.me/${phone}`, '_blank')
  }

  const handleCall = (lead: Lead) => {
    window.location.href = `tel:${lead.phone}`
  }

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                <UsersThree className="size-6" weight="fill" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Leads &amp; CRM
                </h1>
                <p className="text-sm text-muted-foreground">
                  Gestión completa de leads y sistema CRM
                </p>
              </div>
            </div>
            <Button size="sm" onClick={openCreateModal}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nuevo Lead
            </Button>
          </div>

          {loading && <LinearProgress />}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Total Leads</p>
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {stats.total}
                  </p>
                  <Badge variant="neutral" className="mt-2">
                    {stats.new} nuevos
                  </Badge>
                </div>
                <UsersThree className="size-10 shrink-0 text-primary/30" weight="fill" aria-hidden />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">En Proceso</p>
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {stats.inProgress}
                  </p>
                  <Badge variant="warning" className="mt-2">
                    {stats.qualified} calificados
                  </Badge>
                </div>
                <ClipboardText className="size-10 shrink-0 text-warning/40" weight="fill" aria-hidden />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total</p>
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    ${(stats.totalValue / 1000).toFixed(1)}K
                  </p>
                  <Badge variant="success" className="mt-2">
                    {stats.won} ganados
                  </Badge>
                </div>
                <CurrencyDollar className="size-10 shrink-0 text-success/40" weight="fill" aria-hidden />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Score Promedio</p>
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {stats.avgScore}%
                  </p>
                  <Badge variant="primary" className="mt-2">
                    {stats.conversionRate.toFixed(1)}% conversión
                  </Badge>
                </div>
                <TrendUp className="size-10 shrink-0 text-primary/30" weight="fill" aria-hidden />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/[0.02]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex-1">
                <Input
                  placeholder="Buscar por nombre, email, empresa, teléfono..."
                  aria-label="Buscar leads"
                  leftIcon={<MagnifyingGlass aria-hidden />}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value)}>
                <SelectTrigger aria-label="Filtrar por estado" className="h-11 md:w-[200px]">
                  <FunnelSimple className="size-4 shrink-0 opacity-60" aria-hidden />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="new">Nuevo</SelectItem>
                  <SelectItem value="contacted">Contactado</SelectItem>
                  <SelectItem value="qualified">Calificado</SelectItem>
                  <SelectItem value="proposal">Propuesta</SelectItem>
                  <SelectItem value="negotiation">Negociación</SelectItem>
                  <SelectItem value="won">Ganado</SelectItem>
                  <SelectItem value="lost">Perdido</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value)}>
                <SelectTrigger aria-label="Filtrar por fuente" className="h-11 md:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las fuentes</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="referral">Referido</SelectItem>
                  <SelectItem value="social">Redes Sociales</SelectItem>
                  <SelectItem value="event">Evento</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Leads Table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-sm">
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
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                        No se encontraron leads
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => {
                      const status = getStatusConfig(lead.status)
                      return (
                        <tr key={lead.id} className="transition-colors hover:bg-accent/40">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={lead.name} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground">{lead.name}</p>
                                <p className="truncate text-xs text-muted-foreground">{lead.email}</p>
                                <p className="truncate text-xs text-muted-foreground">{lead.phone}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-foreground">{lead.company || '-'}</p>
                            {lead.position && (
                              <p className="text-xs text-muted-foreground">{lead.position}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="neutral">{lead.source}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="min-w-[110px]">
                              <div className="mb-1 flex items-center gap-1.5">
                                <span className="font-semibold tabular-nums text-foreground">
                                  {lead.score}%
                                </span>
                                {lead.score >= 80 && (
                                  <Star className="size-4 text-warning-text" weight="fill" aria-hidden />
                                )}
                              </div>
                              <LinearProgress
                                determinate
                                value={lead.score}
                                color={getScoreColor(lead.score)}
                                sx={{ height: 6 }}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold tabular-nums text-foreground">
                              ${(lead.value / 1000).toFixed(1)}K
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {lead.tags.slice(0, 3).map((tag, idx) => (
                                <Badge key={idx} variant={getTagVariant(tag)}>
                                  {tag}
                                </Badge>
                              ))}
                              {lead.tags.length > 3 && (
                                <Badge variant="neutral">+{lead.tags.length - 3}</Badge>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {lead.assignedTo || '-'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {lead.nextFollowUp
                              ? new Date(lead.nextFollowUp).toLocaleDateString('es-ES')
                              : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-0.5">
                              <Tooltip title="Enviar email">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label={`Enviar email a ${lead.name}`}
                                  onClick={() => handleEmail(lead)}
                                >
                                  <EnvelopeSimple className="size-[18px]" aria-hidden />
                                </Button>
                              </Tooltip>
                              <Tooltip title="WhatsApp">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-wa hover:text-wa"
                                  aria-label={`Enviar WhatsApp a ${lead.name}`}
                                  onClick={() => handleWhatsApp(lead)}
                                >
                                  <WhatsappLogo className="size-[18px]" weight="fill" aria-hidden />
                                </Button>
                              </Tooltip>
                              <Tooltip title="Llamar">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label={`Llamar a ${lead.name}`}
                                  onClick={() => handleCall(lead)}
                                >
                                  <Phone className="size-[18px]" aria-hidden />
                                </Button>
                              </Tooltip>
                              <Tooltip title="Editar">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label={`Editar ${lead.name}`}
                                  onClick={() => openEditModal(lead)}
                                >
                                  <PencilSimple className="size-[18px]" aria-hidden />
                                </Button>
                              </Tooltip>
                              <Tooltip title="Eliminar">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 hover:bg-destructive/10 hover:text-destructive-text"
                                  aria-label={`Eliminar ${lead.name}`}
                                  onClick={() => handleDelete(lead.id)}
                                >
                                  <Trash className="size-[18px]" aria-hidden />
                                </Button>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Create/Edit Lead Modal */}
        <Dialog open={openModal} onOpenChange={setOpenModal}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingLead ? 'Editar Lead' : 'Nuevo Lead'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lead-name">Nombre Completo *</Label>
                <Input
                  id="lead-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: María García"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-email">Email *</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@empresa.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-phone">Teléfono *</Label>
                  <Input
                    id="lead-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+34 612 345 678"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-company">Empresa</Label>
                  <Input
                    id="lead-company"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="Nombre de la empresa"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-position">Cargo</Label>
                  <Input
                    id="lead-position"
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder="CEO, Director, etc."
                  />
                </div>
              </div>

              <div className="border-t border-border" />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-source">Fuente</Label>
                  <Select
                    value={formData.source}
                    onValueChange={(value) => setFormData({ ...formData, source: value })}
                  >
                    <SelectTrigger id="lead-source" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="referral">Referido</SelectItem>
                      <SelectItem value="social">Redes Sociales</SelectItem>
                      <SelectItem value="event">Evento</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-status">Estado</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as Lead['status'] })}
                  >
                    <SelectTrigger id="lead-status" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Nuevo</SelectItem>
                      <SelectItem value="contacted">Contactado</SelectItem>
                      <SelectItem value="qualified">Calificado</SelectItem>
                      <SelectItem value="proposal">Propuesta</SelectItem>
                      <SelectItem value="negotiation">Negociación</SelectItem>
                      <SelectItem value="won">Ganado</SelectItem>
                      <SelectItem value="lost">Perdido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-score">Score (0-100)</Label>
                  <Input
                    id="lead-score"
                    type="number"
                    min={0}
                    max={100}
                    value={formData.score}
                    onChange={(e) =>
                      setFormData({ ...formData, score: parseInt(e.target.value) || 0 })
                    }
                  />
                  <LinearProgress
                    determinate
                    value={formData.score || 0}
                    color={getScoreColor(formData.score || 0)}
                    sx={{ height: 8, mt: 1 }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-value">Valor Estimado ($)</Label>
                  <Input
                    id="lead-value"
                    type="number"
                    value={formData.value}
                    onChange={(e) =>
                      setFormData({ ...formData, value: parseInt(e.target.value) || 0 })
                    }
                    placeholder="15000"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lead-notes">Notas</Label>
                <textarea
                  id="lead-notes"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notas sobre el lead, intereses, próximos pasos..."
                  className={textareaClass}
                />
              </div>

              <div className="border-t border-border" />
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setOpenModal(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSubmit}>
                {editingLead ? 'Guardar Cambios' : 'Crear Lead'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
