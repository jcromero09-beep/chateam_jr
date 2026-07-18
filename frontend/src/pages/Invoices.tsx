import { useState, useEffect, useReducer } from 'react'
import { CircularProgress } from '@mui/joy'
import {
  Receipt as ReceiptIcon,
  DownloadSimple,
  PencilSimple,
  CheckCircle,
  XCircle,
  Clock,
  ArrowClockwise,
  X,
} from '@phosphor-icons/react'
import moment from 'moment'
import { toast } from 'react-toastify'
import { StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import api from '../services/api'

interface Receipt {
  id: number
  descripcion: string
  comprobante: string
  estado: number // 1 = pending, 2 = approved, 3 = rejected
  invoiceId?: number | null
  companyId: number
  purchaseType?: 'subscription' | 'ai_subplan'
  totalPrice?: number
  planId?: number
  planName?: string
  duration?: string | number
  aiSubplanId?: number
  aiTokens?: number
  amountUsd?: number
  aiSubplan?: {
    id: number
    name: string
    tokens: number
    priceUsd: number
  } | null
  createdAt: string
  updatedAt: string
  company: {
    id: number
    name: string
  }
}

interface State {
  receipts: Receipt[]
  count: number
}

type Action =
  | { type: 'LOAD_RECEIPTS'; payload: Receipt[]; count: number }
  | { type: 'UPDATE_RECEIPT'; payload: Receipt }
  | { type: 'RESET' }

const initialState: State = {
  receipts: [],
  count: 0,
}

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'LOAD_RECEIPTS': {
      const newReceipts: Receipt[] = []
      action.payload.forEach((receipt) => {
        const existingIndex = state.receipts.findIndex((r) => r.id === receipt.id)
        if (existingIndex === -1) {
          newReceipts.push(receipt)
        }
      })
      return {
        ...state,
        receipts: [...state.receipts, ...newReceipts],
        count: action.count,
      }
    }
    case 'UPDATE_RECEIPT': {
      const receipt = action.payload
      const receiptIndex = state.receipts.findIndex((r) => r.id === receipt.id)
      if (receiptIndex !== -1) {
        const updatedReceipts = [...state.receipts]
        updatedReceipts[receiptIndex] = receipt
        return { ...state, receipts: updatedReceipts }
      }
      return state
    }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

const getStatusChip = (estado: number) => {
  switch (estado) {
    case 1:
      return (
        <Badge variant="warning">
          <Clock className="size-3.5" aria-hidden />
          Pendiente
        </Badge>
      )
    case 2:
      return (
        <Badge variant="success">
          <CheckCircle className="size-3.5" aria-hidden />
          Aprobado
        </Badge>
      )
    case 3:
      return (
        <Badge variant="destructive">
          <XCircle className="size-3.5" aria-hidden />
          Rechazado
        </Badge>
      )
    default:
      return <Badge variant="neutral">Desconocido</Badge>
  }
}

const formatReceiptType = (receipt: Receipt) =>
  receipt.purchaseType === 'ai_subplan' ? 'Tokens IA' : 'Suscripción'

const formatReceiptAmount = (receipt: Receipt) => {
  const amount = receipt.purchaseType === 'ai_subplan'
    ? receipt.amountUsd ?? receipt.totalPrice
    : receipt.totalPrice

  return amount !== undefined && amount !== null ? `$${Number(amount).toFixed(2)}` : 'N/A'
}

const columns = ['Fecha', 'Empresa', 'Tipo', 'Descripción', 'Estado', 'Acción']

export default function Invoices() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [loading, setLoading] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Stats
  const totalReceipts = state.count
  const pendingReceipts = state.receipts.filter((r) => r.estado === 1).length
  const approvedReceipts = state.receipts.filter((r) => r.estado === 2).length
  const rejectedReceipts = state.receipts.filter((r) => r.estado === 3).length

  useEffect(() => {
    fetchReceipts()
  }, [pageNumber])

  const fetchReceipts = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/recepts/', {
        params: { searchParam: '', pageNumber },
      })
      dispatch({
        type: 'LOAD_RECEIPTS',
        payload: data.receipts || [],
        count: data.count || 0,
      })
      setHasMore(data.hasMore || false)
    } catch (err) {
      console.error('Error fetching receipts:', err)
      toast.error('Error al cargar los recibos')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    dispatch({ type: 'RESET' })
    setPageNumber(1)
    fetchReceipts()
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || loading) return
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      setPageNumber((prev) => prev + 1)
    }
  }

  const handleOpenModal = (receipt: Receipt) => {
    setSelectedReceipt(receipt)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setSelectedReceipt(null)
    setModalOpen(false)
  }

  const handleUpdateReceipt = async (estado: number) => {
    if (!selectedReceipt) return

    setActionLoading(true)
    try {
      await api.put(`/recepts/${selectedReceipt.id}`, {
        estado,
        invoiceId: selectedReceipt.invoiceId,
        companyId: selectedReceipt.companyId,
      })

      toast.success(
        `Recibo ${estado === 2 ? 'aprobado' : 'rechazado'} con éxito`
      )

      // Update local state
      const updatedReceipt = { ...selectedReceipt, estado }
      dispatch({ type: 'UPDATE_RECEIPT', payload: updatedReceipt })
      handleCloseModal()
    } catch (error) {
      console.error('Error updating receipt:', error)
      toast.error('Error al actualizar el recibo')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ReceiptIcon className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Recibos ({totalReceipts})
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestión de recibos y facturación (Solo Super Admin)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
            <Button size="sm">
              <DownloadSimple className="size-4" aria-hidden />
              Exportar
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Total Recibos" value={String(totalReceipts)} />
          <StatTile label="Pendientes" value={String(pendingReceipts)} tone="warning" />
          <StatTile label="Aprobados" value={String(approvedReceipts)} tone="success" />
          <StatTile label="Rechazados" value={String(rejectedReceipts)} tone="destructive" />
        </div>

        {/* Receipts Table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
          <div className="max-h-[60vh] overflow-auto" onScroll={handleScroll}>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-muted text-left">
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                        i >= 4 ? 'text-center' : ''
                      }`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {state.receipts.map((receipt) => (
                  <tr key={receipt.id} className="transition-colors hover:bg-accent/40">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {moment(receipt.updatedAt).format('DD/MM/YYYY')}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {receipt.company?.name || 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={receipt.purchaseType === 'ai_subplan' ? 'primary' : 'neutral'}>
                        {formatReceiptType(receipt)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {receipt.descripcion || 'Sin descripción'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">{getStatusChip(receipt.estado)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          aria-label="Revisar comprobante"
                          title="Revisar comprobante"
                          onClick={() => handleOpenModal(receipt)}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <PencilSimple className="size-[18px]" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <CircularProgress size="sm" />
                    </td>
                  </tr>
                )}
                {!loading && state.receipts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No se encontraron recibos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Receipt Detail Modal */}
      {modalOpen && selectedReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Revisar Comprobante</h2>
              <button
                type="button"
                aria-label="Cerrar"
                title="Cerrar"
                onClick={handleCloseModal}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            </div>

            <div className="space-y-5">
              {/* Receipt Image */}
              <div className="overflow-hidden rounded-lg border border-border bg-background">
                <div className="aspect-[4/3] w-full">
                  <img
                    src={selectedReceipt.comprobante}
                    alt="Comprobante"
                    width={600}
                    height={450}
                    className="size-full object-contain"
                  />
                </div>
              </div>

              {/* Receipt Info */}
              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground">
                  <strong className="font-medium text-foreground">Empresa:</strong>{' '}
                  {selectedReceipt.company?.name || 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong className="font-medium text-foreground">Descripción:</strong>{' '}
                  {selectedReceipt.descripcion || 'Sin descripción'}
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong className="font-medium text-foreground">Tipo:</strong>{' '}
                  {formatReceiptType(selectedReceipt)}
                </p>
                {selectedReceipt.purchaseType === 'ai_subplan' ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      <strong className="font-medium text-foreground">Paquete:</strong>{' '}
                      {selectedReceipt.aiSubplan?.name || selectedReceipt.planName || 'N/A'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <strong className="font-medium text-foreground">Tokens:</strong>{' '}
                      {Number(selectedReceipt.aiTokens || selectedReceipt.aiSubplan?.tokens || 0).toLocaleString('es-ES')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <strong className="font-medium text-foreground">Monto:</strong>{' '}
                      {formatReceiptAmount(selectedReceipt)}
                    </p>
                  </>
                ) : (
                  <>
                    {selectedReceipt.planName && (
                      <p className="text-sm text-muted-foreground">
                        <strong className="font-medium text-foreground">Plan:</strong>{' '}
                        {selectedReceipt.planName}
                      </p>
                    )}
                    {(selectedReceipt.totalPrice !== undefined && selectedReceipt.totalPrice !== null) && (
                      <p className="text-sm text-muted-foreground">
                        <strong className="font-medium text-foreground">Monto:</strong>{' '}
                        {formatReceiptAmount(selectedReceipt)}
                      </p>
                    )}
                  </>
                )}
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <strong className="font-medium text-foreground">Estado actual:</strong>
                  {getStatusChip(selectedReceipt.estado)}
                </p>
              </div>

              {/* Actions */}
              {selectedReceipt.estado === 1 ? (
                <div className="flex justify-center gap-3">
                  <Button
                    className="flex-1 bg-success text-white hover:bg-success/90"
                    loading={actionLoading}
                    onClick={() => handleUpdateReceipt(2)}
                  >
                    <CheckCircle className="size-4" aria-hidden />
                    Aprobar
                  </Button>
                  <Button
                    className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    loading={actionLoading}
                    onClick={() => handleUpdateReceipt(3)}
                  >
                    <XCircle className="size-4" aria-hidden />
                    Rechazar
                  </Button>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  Este recibo ya ha sido procesado.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
