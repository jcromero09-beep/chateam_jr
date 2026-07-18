import { useState, useEffect, useContext, useRef } from 'react'
import {
  Receipt,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  Warning,
  DownloadSimple,
} from '@phosphor-icons/react'
import moment from 'moment'
import { toast } from 'react-toastify'
import { Button } from '@/components/ui/button'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
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

const columns = [
  'Detalles',
  'Usuarios',
  'Conexiones',
  'Colas',
  'Valor',
  'Fecha de vencimiento',
  'Status',
  'Acción',
]

export default function Billing() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [pendingSubscriptionId, setPendingSubscriptionId] = useState<string | null>(null)
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const paypalCaptureAttempted = useRef(false)
  // Get user from AuthContext if needed
  const authContext = useContext(AuthContext)
  const _user = authContext?.user // Keep for future use

  useEffect(() => {
    fetchCompanyData()
    fetchInvoices()
  }, [])

  useEffect(() => {
    if (paypalCaptureAttempted.current) return

    const params = new URLSearchParams(window.location.search)
    const paypalPlan = params.get('paypalPlan')
    const orderID = params.get('token')
    const invoiceId = params.get('invoiceId')

    const cleanPaypalParams = () => {
      const url = new URL(window.location.href)
      url.searchParams.delete('paypalPlan')
      url.searchParams.delete('token')
      url.searchParams.delete('PayerID')
      url.searchParams.delete('invoiceId')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }

    if (paypalPlan === 'cancel') {
      paypalCaptureAttempted.current = true
      toast.info('Pago PayPal cancelado')
      cleanPaypalParams()
      return
    }

    if (paypalPlan === 'subscription') {
      paypalCaptureAttempted.current = true
      toast.success('Suscripción PayPal aprobada. La activación se confirmará automáticamente.')
      cleanPaypalParams()
      fetchInvoices()
      fetchCompanyData()
      return
    }

    if (paypalPlan !== 'success' || !orderID || !invoiceId) return

    paypalCaptureAttempted.current = true

    ;(async () => {
      try {
        setLoading(true)
        await api.post('/subscription/paypal/capture', { orderID, invoiceId: Number(invoiceId) })
        toast.success('Pago PayPal confirmado correctamente.')
        await fetchInvoices()
        await fetchCompanyData()
      } catch (err: any) {
        console.error('Error capturando PayPal:', err)
        toast.error(err.response?.data?.message || 'No se pudo confirmar el pago PayPal')
      } finally {
        cleanPaypalParams()
        setLoading(false)
      }
    })()
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

  const getInvoiceStatus = (
    invoice: Invoice
  ): { label: string; variant: BadgeProps['variant']; icon: JSX.Element } => {
    const today = moment().format('DD/MM/YYYY')
    const dueDate = moment(invoice.dueDate).format('DD/MM/YYYY')
    const diff = moment(dueDate, 'DD/MM/YYYY').diff(moment(today, 'DD/MM/YYYY'))
    const days = moment.duration(diff).asDays()

    if (invoice.status === 'paid') {
      return { label: 'Pago', variant: 'success', icon: <CheckCircle className="size-3.5" weight="fill" aria-hidden /> }
    }
    if (invoice.status === 'proceso') {
      return {
        label: 'En Proceso - Esperando Confirmación',
        variant: 'warning',
        icon: <Clock className="size-3.5" weight="fill" aria-hidden />,
      }
    }
    if (days < 0) {
      return { label: 'Vencido', variant: 'destructive', icon: <Warning className="size-3.5" weight="fill" aria-hidden /> }
    }
    return { label: 'En Proceso', variant: 'primary', icon: <Clock className="size-3.5" weight="fill" aria-hidden /> }
  }

  const getRowClassName = (invoice: Invoice) => {
    const today = moment().format('DD/MM/YYYY')
    const dueDate = moment(invoice.dueDate).format('DD/MM/YYYY')
    const diff = moment(dueDate, 'DD/MM/YYYY').diff(moment(today, 'DD/MM/YYYY'))
    const days = moment.duration(diff).asDays()

    if (days < 0 && invoice.status !== 'paid') {
      return 'bg-destructive/10'
    }
    return ''
  }

  const lastInvoice = invoices.length > 0 ? invoices[0] : null
  const showCancelButton = lastInvoice?.subscriptionId?.startsWith('sub_')
  const isDemoPlan = company?.planId === 1

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Receipt className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Facturas ({invoices.length})
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de facturas y pagos
              </p>
            </div>
          </div>
        </div>

        {/* Demo Plan Warning */}
        {isDemoPlan && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-5 shadow-sm">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-base font-bold text-warning-text">
                <Warning className="size-5 shrink-0" weight="fill" aria-hidden />
                <span>
                  Tu suscripción a <u>{company?.planName || 'Demo'}</u> finaliza
                  {company?.dueDate ? ` el día ${new Date(company.dueDate).toLocaleDateString()}` : ''}.
                </span>
              </p>
              <p className="text-sm text-foreground">
                ¡No estás suscrito a ningún plan! Por favor, renueva o selecciona un plan para continuar usando la aplicación.
              </p>
            </div>
          </div>
        )}

        {/* Cancel Subscription Button */}
        {showCancelButton && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 font-bold text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
              onClick={() => lastInvoice && openCancelConfirmModal(lastInvoice.subscriptionId!)}
            >
              <XCircle className="size-4" weight="fill" aria-hidden />
              Cancelar Suscripción
            </Button>
          </div>
        )}

        {/* Invoices Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      className={cn(
                        'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                        i === 0 ? 'text-left' : 'text-center'
                      )}
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
                      Cargando...
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron facturas
                    </td>
                  </tr>
                ) : (
                  invoices.map((invoice) => {
                    const status = getInvoiceStatus(invoice)
                    return (
                      <tr
                        key={invoice.id}
                        className={cn('transition-colors hover:bg-accent/40', getRowClassName(invoice))}
                      >
                        <td className="px-4 py-3 text-foreground">{invoice.detail}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                          {invoice.users}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                          {invoice.connections}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                          {invoice.queues}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold tabular-nums text-foreground">
                          {invoice.value.toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          })}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center tabular-nums text-muted-foreground">
                          {moment(invoice.dueDate).format('DD/MM/YYYY')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <Badge variant={status.variant}>
                              {status.icon}
                              {status.label}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            {isDemoPlan && !['proceso', 'paid'].includes(invoice.status) ? (
                              <Button
                                size="sm"
                                className="border border-warning bg-warning font-bold text-primary-foreground hover:bg-warning/90"
                                onClick={() => handleOpenSubscriptionModal(invoice)}
                              >
                                Contrata tu plan
                              </Button>
                            ) : status.label === 'Pago' ? (
                              <Tooltip title="Descargar factura">
                                <button
                                  type="button"
                                  aria-label="Descargar factura"
                                  onClick={() => invoice.linkInvoice && window.open(invoice.linkInvoice, '_blank')}
                                  className="flex size-8 items-center justify-center rounded-md text-success-text transition-colors hover:bg-success/10 hover:text-success-text"
                                >
                                  <DownloadSimple className="size-[18px]" aria-hidden />
                                </button>
                              </Tooltip>
                            ) : status.label === 'En Proceso - Esperando Confirmación' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled
                                className="border-warning/40 bg-warning/15 text-warning-text"
                              >
                                EN PROCESO
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleOpenSubscriptionModal(invoice)}
                              >
                                <CreditCard className="size-4" weight="fill" aria-hidden />
                                PAGAR
                              </Button>
                            )}
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

      {/* Cancel Confirmation Modal */}
      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Seguro que deseas cancelar la suscripción?</DialogTitle>
            <DialogDescription>
              Esta acción cancelará la suscripción al final del periodo actual y no se podrá revertir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmCancel}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subscription Modal */}
      <SubscriptionModal
        open={subscriptionModalOpen}
        onClose={handleCloseSubscriptionModal}
        invoice={selectedInvoice}
      />
    </div>
  )
}
