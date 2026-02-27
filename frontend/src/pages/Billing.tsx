import { useState, useEffect, useContext } from 'react'
import {
  Container,
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Button,
  IconButton,
  Chip,
  Sheet,
  Table,
  Modal,
  ModalDialog,
  ModalClose,
  Tooltip,
} from '@mui/joy'
import {
  Receipt as ReceiptIcon,
  Payment as PaymentIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Pending as PendingIcon,
  Warning as WarningIcon,
  CreditCard as CardIcon,
} from '@mui/icons-material'
import moment from 'moment'
import { toast } from 'react-toastify'
import api from '../services/api'
import { AuthContext } from '../context/Auth/AuthContext'
import SubscriptionModal from '../components/SubscriptionModal'

interface Invoice {
  id: number
  detail: string
  users: number
  connections: number
  queues: number
  value: number
  dueDate: string
  status: 'paid' | 'open' | 'proceso'
  subscriptionId?: string
  linkInvoice?: string
  planId?: number
  recurrence?: string
}

interface Company {
  id: number
  planId: number
  planName: string
  dueDate: string
}

export default function Billing() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [pendingSubscriptionId, setPendingSubscriptionId] = useState<string | null>(null)
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  // Get user from AuthContext if needed
  const authContext = useContext(AuthContext)
  const _user = authContext?.user // Keep for future use

  useEffect(() => {
    fetchCompanyData()
    fetchInvoices()
  }, [])

  const fetchCompanyData = async () => {
    try {
      const { data } = await api.get('/companies')
      if (data && data.length > 0) {
        setCompany(data[0])
      }
    } catch (err) {
      console.error('Error fetching company data:', err)
    }
  }

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/invoices/all', {
        params: { searchParam: '', pageNumber: 1 }
      })
      setInvoices(data || [])
    } catch (err) {
      console.error('Error fetching invoices:', err)
      toast.error('Error al cargar las facturas')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenSubscriptionModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice)
    setSubscriptionModalOpen(true)
  }

  const handleCloseSubscriptionModal = () => {
    setSelectedInvoice(null)
    setSubscriptionModalOpen(false)
    fetchInvoices() // Refresh invoices after modal closes
  }

  const openCancelConfirmModal = (subscriptionId: string) => {
    setPendingSubscriptionId(subscriptionId)
    setConfirmModalOpen(true)
  }

  const handleConfirmCancel = async () => {
    if (!pendingSubscriptionId) return
    try {
      await api.post('/subscription/cancel', { subscriptionId: pendingSubscriptionId })
      toast.success('Suscripción cancelada correctamente.')
      fetchInvoices()
    } catch (error) {
      console.error('Error canceling subscription:', error)
      toast.error('No se pudo cancelar la suscripción')
    } finally {
      setConfirmModalOpen(false)
      setPendingSubscriptionId(null)
    }
  }

  const getInvoiceStatus = (invoice: Invoice) => {
    const today = moment().format('DD/MM/YYYY')
    const dueDate = moment(invoice.dueDate).format('DD/MM/YYYY')
    const diff = moment(dueDate, 'DD/MM/YYYY').diff(moment(today, 'DD/MM/YYYY'))
    const days = moment.duration(diff).asDays()

    if (invoice.status === 'paid') {
      return { label: 'Pago', color: 'success' as const, icon: <CheckIcon /> }
    }
    if (invoice.status === 'proceso') {
      return { label: 'En Proceso - Esperando Confirmación', color: 'warning' as const, icon: <PendingIcon /> }
    }
    if (days < 0) {
      return { label: 'Vencido', color: 'danger' as const, icon: <WarningIcon /> }
    }
    return { label: 'En Proceso', color: 'primary' as const, icon: <PendingIcon /> }
  }

  const getRowStyle = (invoice: Invoice) => {
    const today = moment().format('DD/MM/YYYY')
    const dueDate = moment(invoice.dueDate).format('DD/MM/YYYY')
    const diff = moment(dueDate, 'DD/MM/YYYY').diff(moment(today, 'DD/MM/YYYY'))
    const days = moment.duration(diff).asDays()

    if (days < 0 && invoice.status !== 'paid') {
      return { backgroundColor: '#ffbcbc9c' }
    }
    return {}
  }

  const lastInvoice = invoices.length > 0 ? invoices[0] : null
  const showCancelButton = lastInvoice?.subscriptionId?.startsWith('sub_')
  const isDemoPlan = company?.planId === 1

  return (
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ReceiptIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Facturas ({invoices.length})</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de facturas y pagos
              </Typography>
            </Box>
          </Stack>
        </Stack>

        {/* Demo Plan Warning */}
        {isDemoPlan && (
          <Card
            variant="soft"
            color="warning"
            sx={{
              backgroundColor: '#fff8e1',
              boxShadow: '0 0 10px 2px rgb(252, 229, 154)',
            }}
          >
            <CardContent>
              <Stack spacing={1}>
                <Typography level="title-lg" sx={{ color: '#ff6f00', fontWeight: 'bold' }}>
                  ⚠️ Tu suscripción a <u>{company?.planName || 'Demo'}</u> finaliza
                  {company?.dueDate ? ` el día ${new Date(company.dueDate).toLocaleDateString()}` : ''}.
                </Typography>
                <Typography level="body-md">
                  ¡No estás suscrito a ningún plan! Por favor, renueva o selecciona un plan para continuar usando la aplicación.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Cancel Subscription Button */}
        {showCancelButton && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              color="danger"
              size="sm"
              startDecorator={<CancelIcon />}
              onClick={() => lastInvoice && openCancelConfirmModal(lastInvoice.subscriptionId!)}
              sx={{ fontWeight: 'bold' }}
            >
              Cancelar Suscripción
            </Button>
          </Box>
        )}

        {/* Invoices Table */}
        <Card>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 200 }}>Detalles</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Usuarios</th>
                  <th style={{ width: 120, textAlign: 'center' }}>Conexiones</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Colas</th>
                  <th style={{ width: 120, textAlign: 'center' }}>Valor</th>
                  <th style={{ width: 150, textAlign: 'center' }}>Fecha de vencimiento</th>
                  <th style={{ width: 180, textAlign: 'center' }}>Status</th>
                  <th style={{ width: 150, textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>Cargando...</Typography>
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron facturas</Typography>
                    </td>
                  </tr>
                ) : (
                  invoices.map((invoice) => {
                    const status = getInvoiceStatus(invoice)
                    return (
                      <tr key={invoice.id} style={getRowStyle(invoice)}>
                        <td>
                          <Typography level="body-sm">{invoice.detail}</Typography>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Typography level="body-sm">{invoice.users}</Typography>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Typography level="body-sm">{invoice.connections}</Typography>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Typography level="body-sm">{invoice.queues}</Typography>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Typography level="body-sm" fontWeight="bold">
                            {invoice.value.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            })}
                          </Typography>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Typography level="body-sm">
                            {moment(invoice.dueDate).format('DD/MM/YYYY')}
                          </Typography>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Chip
                            size="sm"
                            color={status.color}
                            startDecorator={status.icon}
                          >
                            {status.label}
                          </Chip>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isDemoPlan && !['proceso', 'paid'].includes(invoice.status) ? (
                            <Button
                              size="sm"
                              variant="solid"
                              color="warning"
                              onClick={() => handleOpenSubscriptionModal(invoice)}
                              sx={{
                                backgroundColor: '#FFD600',
                                color: '#232323',
                                fontWeight: 'bold',
                                border: '2px solid #FFA000',
                                '&:hover': {
                                  backgroundColor: '#FFA000',
                                },
                              }}
                            >
                              Contrata tu plan
                            </Button>
                          ) : status.label === 'Pago' ? (
                            <Tooltip title="Descargar factura">
                              <IconButton
                                size="sm"
                                variant="plain"
                                color="success"
                                onClick={() => invoice.linkInvoice && window.open(invoice.linkInvoice, '_blank')}
                              >
                                <PaymentIcon />
                              </IconButton>
                            </Tooltip>
                          ) : status.label === 'En Proceso - Esperando Confirmación' ? (
                            <Button size="sm" variant="soft" color="warning" disabled>
                              EN PROCESO
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="solid"
                              color="primary"
                              startDecorator={<CardIcon />}
                              onClick={() => handleOpenSubscriptionModal(invoice)}
                            >
                              PAGAR
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Cancel Confirmation Modal */}
        <Modal open={confirmModalOpen} onClose={() => setConfirmModalOpen(false)}>
          <ModalDialog>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              ¿Seguro que deseas cancelar la suscripción?
            </Typography>
            <Typography level="body-md" sx={{ mb: 3 }}>
              Esta acción cancelará la suscripción al final del periodo actual y no se podrá revertir.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button
                variant="outlined"
                color="neutral"
                onClick={() => setConfirmModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button variant="solid" color="danger" onClick={handleConfirmCancel}>
                Confirmar
              </Button>
            </Stack>
          </ModalDialog>
        </Modal>

        {/* Subscription Modal */}
        <SubscriptionModal
          open={subscriptionModalOpen}
          onClose={handleCloseSubscriptionModal}
          invoice={selectedInvoice}
        />
      </Stack>
    </Container>
  )
}
