import { useState, useEffect, useReducer } from 'react'
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
  CircularProgress,
  AspectRatio,
} from '@mui/joy'
import {
  Receipt as ReceiptIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Pending as PendingIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import moment from 'moment'
import { toast } from 'react-toastify'
import api from '../services/api'

interface Receipt {
  id: number
  descripcion: string
  comprobante: string
  estado: number // 1 = pending, 2 = approved, 3 = rejected
  invoiceId: number
  companyId: number
  totalPrice?: number
  planId?: number
  planName?: string
  duration?: number
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
        <Chip color="warning" startDecorator={<PendingIcon />} size="sm">
          Pendiente
        </Chip>
      )
    case 2:
      return (
        <Chip color="success" startDecorator={<CheckIcon />} size="sm">
          Aprobado
        </Chip>
      )
    case 3:
      return (
        <Chip color="danger" startDecorator={<CancelIcon />} size="sm">
          Rechazado
        </Chip>
      )
    default:
      return (
        <Chip color="neutral" size="sm">
          Desconocido
        </Chip>
      )
  }
}

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
    <Container maxWidth="xl">
      <Stack spacing={3}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center">
            <ReceiptIcon sx={{ fontSize: 32, color: 'primary.main' }} />
            <Box>
              <Typography level="h2">Recibos ({totalReceipts})</Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Gestión de recibos y facturación (Solo Super Admin)
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              startDecorator={<RefreshIcon />}
              variant="outlined"
              color="neutral"
              onClick={handleRefresh}
            >
              Actualizar
            </Button>
            <Button startDecorator={<DownloadIcon />} color="primary">
              Exportar
            </Button>
          </Stack>
        </Stack>

        {/* Stats Cards */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography level="body-sm" sx={{ mb: 1 }}>
                Total Recibos
              </Typography>
              <Typography level="h2">{totalReceipts}</Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography level="body-sm" sx={{ mb: 1 }}>
                Pendientes
              </Typography>
              <Typography level="h2" sx={{ color: 'warning.main' }}>
                {pendingReceipts}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography level="body-sm" sx={{ mb: 1 }}>
                Aprobados
              </Typography>
              <Typography level="h2" sx={{ color: 'success.main' }}>
                {approvedReceipts}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography level="body-sm" sx={{ mb: 1 }}>
                Rechazados
              </Typography>
              <Typography level="h2" sx={{ color: 'danger.main' }}>
                {rejectedReceipts}
              </Typography>
            </CardContent>
          </Card>
        </Stack>

        {/* Receipts Table */}
        <Card>
          <Sheet
            sx={{
              overflow: 'auto',
              maxHeight: '60vh',
            }}
            onScroll={handleScroll}
          >
            <Table stickyHeader>
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Fecha</th>
                  <th style={{ width: 200 }}>Empresa</th>
                  <th style={{ width: 250 }}>Descripción</th>
                  <th style={{ width: 120, textAlign: 'center' }}>Estado</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {state.receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td>
                      <Typography level="body-sm">
                        {moment(receipt.updatedAt).format('DD/MM/YYYY')}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {receipt.company?.name || 'N/A'}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {receipt.descripcion || 'Sin descripción'}
                      </Typography>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {getStatusChip(receipt.estado)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <IconButton
                        size="sm"
                        color="primary"
                        onClick={() => handleOpenModal(receipt)}
                      >
                        <EditIcon />
                      </IconButton>
                    </td>
                  </tr>
                ))}
                {loading && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                      <CircularProgress size="sm" />
                    </td>
                  </tr>
                )}
                {!loading && state.receipts.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                      <Typography>No se encontraron recibos</Typography>
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Sheet>
        </Card>

        {/* Receipt Detail Modal */}
        <Modal open={modalOpen} onClose={handleCloseModal}>
          <ModalDialog sx={{ maxWidth: 500, width: '90%' }}>
            <ModalClose />
            <Typography level="h4" sx={{ mb: 2 }}>
              Revisar Comprobante
            </Typography>

            {selectedReceipt && (
              <Stack spacing={3}>
                {/* Receipt Image */}
                <Card variant="outlined">
                  <AspectRatio ratio="4/3">
                    <img
                      src={selectedReceipt.comprobante}
                      alt="Comprobante"
                      style={{ objectFit: 'contain' }}
                    />
                  </AspectRatio>
                </Card>

                {/* Receipt Info */}
                <Stack spacing={1}>
                  <Typography level="body-sm">
                    <strong>Empresa:</strong> {selectedReceipt.company?.name || 'N/A'}
                  </Typography>
                  <Typography level="body-sm">
                    <strong>Descripción:</strong> {selectedReceipt.descripcion || 'Sin descripción'}
                  </Typography>
                  {selectedReceipt.planName && (
                    <Typography level="body-sm">
                      <strong>Plan:</strong> {selectedReceipt.planName}
                    </Typography>
                  )}
                  {selectedReceipt.totalPrice && (
                    <Typography level="body-sm">
                      <strong>Monto:</strong> ${selectedReceipt.totalPrice.toFixed(2)}
                    </Typography>
                  )}
                  <Typography level="body-sm">
                    <strong>Estado actual:</strong> {getStatusChip(selectedReceipt.estado)}
                  </Typography>
                </Stack>

                {/* Actions */}
                {selectedReceipt.estado === 1 && (
                  <Stack direction="row" spacing={2} justifyContent="center">
                    <Button
                      variant="solid"
                      color="success"
                      startDecorator={<CheckIcon />}
                      onClick={() => handleUpdateReceipt(2)}
                      loading={actionLoading}
                      sx={{ flex: 1 }}
                    >
                      Aprobar
                    </Button>
                    <Button
                      variant="solid"
                      color="danger"
                      startDecorator={<CancelIcon />}
                      onClick={() => handleUpdateReceipt(3)}
                      loading={actionLoading}
                      sx={{ flex: 1 }}
                    >
                      Rechazar
                    </Button>
                  </Stack>
                )}

                {selectedReceipt.estado !== 1 && (
                  <Typography level="body-sm" sx={{ textAlign: 'center', color: 'text.tertiary' }}>
                    Este recibo ya ha sido procesado.
                  </Typography>
                )}
              </Stack>
            )}
          </ModalDialog>
        </Modal>
      </Stack>
    </Container>
  )
}
