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
  IconButton,
  Chip,
  Sheet,
  Table,
  Input,
  Select,
  Option,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Textarea,
  Divider,
  LinearProgress,
  Tooltip,
  Avatar,
} from '@mui/joy'
import {
  Groups as GroupsIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Email as EmailIcon,
  WhatsApp as WhatsAppIcon,
  Phone as PhoneIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  TrendingUp as TrendingUpIcon,
  Star as StarIcon,
  Assignment as AssignmentIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material'

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

  // Status configuration
  const getStatusConfig = (status: string) => {
    const configs = {
      new: { color: 'neutral', label: 'Nuevo' },
      contacted: { color: 'primary', label: 'Contactado' },
      qualified: { color: 'success', label: 'Calificado' },
      proposal: { color: 'warning', label: 'Propuesta' },
      negotiation: { color: 'warning', label: 'Negociación' },
      won: { color: 'success', label: 'Ganado' },
      lost: { color: 'danger', label: 'Perdido' },
    }
    return configs[status as keyof typeof configs] || configs.new
  }

  // Get score color based on value
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'success'
    if (score >= 60) return 'primary'
    if (score >= 40) return 'warning'
    return 'danger'
  }

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
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <GroupsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Leads & CRM</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión completa de leads y sistema CRM
              </Typography>
            </Box>
          </Stack>
          <Button startDecorator={<AddIcon />} color="primary" onClick={openCreateModal}>
            Nuevo Lead
          </Button>
        </Stack>

        {loading && <LinearProgress />}

        {/* KPI Cards */}
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                      Total Leads
                    </Typography>
                    <Typography level="h2">{stats.total}</Typography>
                    <Chip size="sm" color="neutral" variant="soft" sx={{ mt: 1 }}>
                      {stats.new} nuevos
                    </Chip>
                  </Box>
                  <GroupsIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
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
                      En Proceso
                    </Typography>
                    <Typography level="h2">{stats.inProgress}</Typography>
                    <Chip size="sm" color="warning" variant="soft" sx={{ mt: 1 }}>
                      {stats.qualified} calificados
                    </Chip>
                  </Box>
                  <AssignmentIcon sx={{ fontSize: 48, color: 'warning.main', opacity: 0.3 }} />
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
                      Valor Total
                    </Typography>
                    <Typography level="h2">${(stats.totalValue / 1000).toFixed(1)}K</Typography>
                    <Chip size="sm" color="success" variant="soft" sx={{ mt: 1 }}>
                      {stats.won} ganados
                    </Chip>
                  </Box>
                  <MoneyIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
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
                      Score Promedio
                    </Typography>
                    <Typography level="h2">{stats.avgScore}%</Typography>
                    <Chip size="sm" color="primary" variant="soft" sx={{ mt: 1 }}>
                      {stats.conversionRate.toFixed(1)}% conversión
                    </Chip>
                  </Box>
                  <TrendingUpIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Input
                placeholder="Buscar por nombre, email, empresa, teléfono..."
                startDecorator={<SearchIcon />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ flexGrow: 1 }}
              />
              <Select
                value={statusFilter}
                onChange={(_, value) => setStatusFilter(value as string)}
                startDecorator={<FilterIcon />}
                sx={{ minWidth: 180 }}
              >
                <Option value="all">Todos los estados</Option>
                <Option value="new">Nuevo</Option>
                <Option value="contacted">Contactado</Option>
                <Option value="qualified">Calificado</Option>
                <Option value="proposal">Propuesta</Option>
                <Option value="negotiation">Negociación</Option>
                <Option value="won">Ganado</Option>
                <Option value="lost">Perdido</Option>
              </Select>
              <Select
                value={sourceFilter}
                onChange={(_, value) => setSourceFilter(value as string)}
                sx={{ minWidth: 180 }}
              >
                <Option value="all">Todas las fuentes</Option>
                <Option value="website">Website</Option>
                <Option value="referral">Referido</Option>
                <Option value="social">Redes Sociales</Option>
                <Option value="event">Evento</Option>
                <Option value="linkedin">LinkedIn</Option>
                <Option value="google">Google</Option>
              </Select>
            </Stack>
          </CardContent>
        </Card>

        {/* Leads Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 250 }}>Lead</th>
                  <th style={{ width: 180 }}>Empresa</th>
                  <th style={{ width: 120 }}>Fuente</th>
                  <th style={{ width: 130 }}>Estado</th>
                  <th style={{ width: 150 }}>Score</th>
                  <th style={{ width: 100 }}>Valor</th>
                  <th style={{ width: 200 }}>Tags</th>
                  <th style={{ width: 150 }}>Asignado</th>
                  <th style={{ width: 120 }}>Próximo</th>
                  <th style={{ width: 200 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron leads</Typography>
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar size="sm">
                            {lead.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </Avatar>
                          <Box>
                            <Typography level="body-sm" fontWeight="bold">
                              {lead.name}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {lead.email}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {lead.phone}
                            </Typography>
                          </Box>
                        </Stack>
                      </td>
                      <td>
                        <Typography level="body-sm">{lead.company || '-'}</Typography>
                        {lead.position && (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {lead.position}
                          </Typography>
                        )}
                      </td>
                      <td>
                        <Chip size="sm" variant="soft">
                          {lead.source}
                        </Chip>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          color={getStatusConfig(lead.status).color as any}
                          variant="soft"
                        >
                          {getStatusConfig(lead.status).label}
                        </Chip>
                      </td>
                      <td>
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Typography level="body-sm" fontWeight="bold">
                              {lead.score}%
                            </Typography>
                            {lead.score >= 80 && (
                              <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                            )}
                          </Stack>
                          <LinearProgress
                            determinate
                            value={lead.score}
                            color={getScoreColor(lead.score)}
                            sx={{ height: 6 }}
                          />
                        </Box>
                      </td>
                      <td>
                        <Typography level="body-sm" fontWeight="bold">
                          ${(lead.value / 1000).toFixed(1)}K
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                          {lead.tags.slice(0, 3).map((tag, idx) => (
                            <Chip
                              key={idx}
                              size="sm"
                              variant="outlined"
                              color={
                                tag === 'hot'
                                  ? 'danger'
                                  : tag === 'warm'
                                    ? 'warning'
                                    : 'neutral'
                              }
                            >
                              {tag}
                            </Chip>
                          ))}
                          {lead.tags.length > 3 && (
                            <Chip size="sm" variant="soft">
                              +{lead.tags.length - 3}
                            </Chip>
                          )}
                        </Stack>
                      </td>
                      <td>
                        <Typography level="body-sm">{lead.assignedTo || '-'}</Typography>
                      </td>
                      <td>
                        <Typography level="body-xs">
                          {lead.nextFollowUp
                            ? new Date(lead.nextFollowUp).toLocaleDateString('es-ES')
                            : '-'}
                        </Typography>
                      </td>
                      <td>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="Enviar email">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="primary"
                              onClick={() => handleEmail(lead)}
                            >
                              <EmailIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="WhatsApp">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="success"
                              onClick={() => handleWhatsApp(lead)}
                            >
                              <WhatsAppIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Llamar">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="neutral"
                              onClick={() => handleCall(lead)}
                            >
                              <PhoneIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Editar">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="neutral"
                              onClick={() => openEditModal(lead)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="sm"
                              variant="plain"
                              color="danger"
                              onClick={() => handleDelete(lead.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Create/Edit Lead Modal */}
        <Modal open={openModal} onClose={() => setOpenModal(false)}>
          <ModalDialog sx={{ minWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              {editingLead ? 'Editar Lead' : 'Nuevo Lead'}
            </Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Nombre Completo *</FormLabel>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: María García"
                />
              </FormControl>

              <Grid container spacing={2}>
                <Grid xs={12} sm={6}>
                  <FormControl>
                    <FormLabel>Email *</FormLabel>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@empresa.com"
                    />
                  </FormControl>
                </Grid>
                <Grid xs={12} sm={6}>
                  <FormControl>
                    <FormLabel>Teléfono *</FormLabel>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+34 612 345 678"
                    />
                  </FormControl>
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid xs={12} sm={6}>
                  <FormControl>
                    <FormLabel>Empresa</FormLabel>
                    <Input
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      placeholder="Nombre de la empresa"
                    />
                  </FormControl>
                </Grid>
                <Grid xs={12} sm={6}>
                  <FormControl>
                    <FormLabel>Cargo</FormLabel>
                    <Input
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="CEO, Director, etc."
                    />
                  </FormControl>
                </Grid>
              </Grid>

              <Divider />

              <Grid container spacing={2}>
                <Grid xs={12} sm={6}>
                  <FormControl>
                    <FormLabel>Fuente</FormLabel>
                    <Select
                      value={formData.source}
                      onChange={(_, value) => setFormData({ ...formData, source: value as string })}
                    >
                      <Option value="website">Website</Option>
                      <Option value="referral">Referido</Option>
                      <Option value="social">Redes Sociales</Option>
                      <Option value="event">Evento</Option>
                      <Option value="linkedin">LinkedIn</Option>
                      <Option value="google">Google</Option>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid xs={12} sm={6}>
                  <FormControl>
                    <FormLabel>Estado</FormLabel>
                    <Select
                      value={formData.status}
                      onChange={(_, value) => setFormData({ ...formData, status: value as any })}
                    >
                      <Option value="new">Nuevo</Option>
                      <Option value="contacted">Contactado</Option>
                      <Option value="qualified">Calificado</Option>
                      <Option value="proposal">Propuesta</Option>
                      <Option value="negotiation">Negociación</Option>
                      <Option value="won">Ganado</Option>
                      <Option value="lost">Perdido</Option>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid xs={12} sm={6}>
                  <FormControl>
                    <FormLabel>Score (0-100)</FormLabel>
                    <Input
                      type="number"
                      value={formData.score}
                      onChange={(e) =>
                        setFormData({ ...formData, score: parseInt(e.target.value) || 0 })
                      }
                      slotProps={{ input: { min: 0, max: 100 } }}
                    />
                    <LinearProgress
                      determinate
                      value={formData.score || 0}
                      color={getScoreColor(formData.score || 0)}
                      sx={{ height: 8, mt: 1 }}
                    />
                  </FormControl>
                </Grid>
                <Grid xs={12} sm={6}>
                  <FormControl>
                    <FormLabel>Valor Estimado ($)</FormLabel>
                    <Input
                      type="number"
                      value={formData.value}
                      onChange={(e) =>
                        setFormData({ ...formData, value: parseInt(e.target.value) || 0 })
                      }
                      placeholder="15000"
                    />
                  </FormControl>
                </Grid>
              </Grid>

              <FormControl>
                <FormLabel>Notas</FormLabel>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  minRows={3}
                  placeholder="Notas sobre el lead, intereses, próximos pasos..."
                />
              </FormControl>

              <Divider />

              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button variant="outlined" color="neutral" onClick={() => setOpenModal(false)}>
                  Cancelar
                </Button>
                <Button color="primary" onClick={handleSubmit}>
                  {editingLead ? 'Guardar Cambios' : 'Crear Lead'}
                </Button>
              </Stack>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
