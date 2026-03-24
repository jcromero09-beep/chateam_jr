import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Card, CardContent, Grid, Table, Sheet, Chip,
  CircularProgress, Alert, Button, Modal, ModalDialog, ModalClose,
  FormControl, FormLabel, Input, Select, Option
} from '@mui/joy'
import {
  Wallet, ArrowUpCircle, AlertCircle
} from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface WalletData {
  id: number
  availableBalance: number
  pendingBalance: number
  totalEarned: number
  totalWithdrawn: number
  currency: string
  status: string
}

interface Transaction {
  id: number
  type: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  description: string
  createdAt: string
}

const TX_TYPE_MAP: Record<string, { label: string; color: 'success' | 'danger' | 'warning' | 'primary' | 'neutral' }> = {
  commission: { label: 'Comisión', color: 'success' },
  withdrawal: { label: 'Retiro', color: 'danger' },
  bonus: { label: 'Bono', color: 'primary' },
  adjustment: { label: 'Ajuste', color: 'warning' },
  refund: { label: 'Reembolso', color: 'neutral' },
  settlement: { label: 'Liquidación', color: 'neutral' },
}

// --- Modal Solicitar Retiro ---
function WithdrawalModal({ open, onClose, onSuccess, maxAmount }: {
  open: boolean; onClose: () => void; onSuccess: () => void; maxAmount: number
}) {
  const [amount, setAmount] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (amount <= 0) { setError('El monto debe ser mayor a 0'); return }
    if (amount > maxAmount) { setError('Monto excede el balance disponible'); return }
    setSaving(true)
    setError(null)
    try {
      await api.post('/affiliates/withdrawals', { amount, paymentMethod })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al solicitar retiro'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxWidth: 400 }}>
        <ModalClose />
        <Typography level="title-lg">Solicitar Retiro</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          {error && <Alert color="danger" size="sm">{error}</Alert>}
          <FormControl required>
            <FormLabel>Monto (USD)</FormLabel>
            <Input
              type="number" value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              slotProps={{ input: { min: 0, max: maxAmount, step: 1 } }}
              endDecorator={<Typography level="body-xs">/ ${maxAmount.toFixed(2)}</Typography>}
            />
          </FormControl>
          <FormControl required>
            <FormLabel>Método de Pago</FormLabel>
            <Select value={paymentMethod} onChange={(_, v) => setPaymentMethod(v || 'bank_transfer')}>
              <Option value="bank_transfer">Transferencia Bancaria</Option>
              <Option value="paypal">PayPal</Option>
              <Option value="crypto">Criptomoneda</Option>
            </Select>
          </FormControl>
          <Button loading={saving} onClick={handleSubmit} color="success" sx={{ mt: 1 }}>
            Solicitar Retiro
          </Button>
        </Box>
      </ModalDialog>
    </Modal>
  )
}

// --- Main Page ---
export default function AffiliateWallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [programName, setProgramName] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txCount, setTxCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [txTypeFilter, setTxTypeFilter] = useState<string>('')
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false)

  const fetchWallet = useCallback(async () => {
    try {
      setLoading(true)
      const { data: res } = await api.get('/affiliates/wallet')
      if (res.success) {
        setWallet(res.data.wallet)
        setProgramName(res.data.programName)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar wallet'
      setError(msg)
      devLog('[AffiliateWallet] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTransactions = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { limit: 30 }
      if (txTypeFilter) params.type = txTypeFilter
      const { data: res } = await api.get('/affiliates/wallet/transactions', { params })
      if (res.success) {
        setTransactions(res.data.rows || [])
        setTxCount(res.data.count || 0)
      }
    } catch (err: unknown) {
      devLog('[AffiliateWallet] TX Error:', err)
    }
  }, [txTypeFilter])

  useEffect(() => { fetchWallet() }, [fetchWallet])
  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const formatCurrency = (val: number) => `$${Number(val || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size="lg" /></Box>
  }

  if (error) {
    return <Box sx={{ p: 3 }}><Alert color="danger" startDecorator={<AlertCircle size={18} />}>{error}</Alert></Box>
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography level="h3" sx={{ fontWeight: 700 }}>
            <Wallet size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Billetera
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.500' }}>{programName}</Typography>
        </Box>
        {wallet && Number(wallet.availableBalance) > 0 && (
          <Button
            size="sm" color="success"
            startDecorator={<ArrowUpCircle size={16} />}
            onClick={() => setWithdrawalModalOpen(true)}
          >
            Solicitar Retiro
          </Button>
        )}
      </Box>

      {/* Balance Cards */}
      {wallet && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid xs={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'neutral.500' }}>Disponible</Typography>
                <Typography level="h4" sx={{ fontWeight: 700, color: '#52b788' }}>
                  {formatCurrency(wallet.availableBalance)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'neutral.500' }}>Pendiente</Typography>
                <Typography level="h4" sx={{ fontWeight: 700, color: '#f3a43b' }}>
                  {formatCurrency(wallet.pendingBalance)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'neutral.500' }}>Total Ganado</Typography>
                <Typography level="h4" sx={{ fontWeight: 700, color: '#3b82f6' }}>
                  {formatCurrency(wallet.totalEarned)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid xs={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Typography level="body-sm" sx={{ color: 'neutral.500' }}>Retirado</Typography>
                <Typography level="h4" sx={{ fontWeight: 700 }}>
                  {formatCurrency(wallet.totalWithdrawn)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Transactions */}
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography level="title-md">Transacciones ({txCount})</Typography>
            <Select
              size="sm" placeholder="Tipo" value={txTypeFilter}
              onChange={(_, v) => setTxTypeFilter(v || '')}
              sx={{ minWidth: 130 }}
            >
              <Option value="">Todos</Option>
              <Option value="commission">Comisión</Option>
              <Option value="withdrawal">Retiro</Option>
              <Option value="bonus">Bono</Option>
              <Option value="adjustment">Ajuste</Option>
            </Select>
          </Box>

          {transactions.length === 0 ? (
            <Typography level="body-sm" sx={{ textAlign: 'center', color: 'neutral.400', py: 4 }}>
              Sin transacciones
            </Typography>
          ) : (
            <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto' }}>
              <Table size="sm" hoverRow>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Monto</th>
                    <th>Saldo Antes</th>
                    <th>Saldo Después</th>
                    <th>Descripción</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const tc = TX_TYPE_MAP[tx.type] || TX_TYPE_MAP.adjustment
                    return (
                      <tr key={tx.id}>
                        <td><Chip size="sm" variant="soft" color={tc.color}>{tc.label}</Chip></td>
                        <td>
                          <Typography
                            level="body-sm"
                            sx={{ fontWeight: 600, color: tx.amount >= 0 ? '#52b788' : '#ef4444' }}
                          >
                            {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                          </Typography>
                        </td>
                        <td><Typography level="body-xs">{formatCurrency(tx.balanceBefore)}</Typography></td>
                        <td><Typography level="body-xs">{formatCurrency(tx.balanceAfter)}</Typography></td>
                        <td><Typography level="body-xs">{tx.description}</Typography></td>
                        <td><Typography level="body-xs">{formatDate(tx.createdAt)}</Typography></td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Sheet>
          )}
        </CardContent>
      </Card>

      {wallet && (
        <WithdrawalModal
          open={withdrawalModalOpen}
          onClose={() => setWithdrawalModalOpen(false)}
          onSuccess={() => { fetchWallet(); fetchTransactions() }}
          maxAmount={Number(wallet.availableBalance)}
        />
      )}
    </Box>
  )
}
