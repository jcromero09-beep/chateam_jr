import { useState, useEffect, useMemo } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  FormControl,
  FormLabel,
  Input,
  Select,
  Option,
  Button,
  Table,
  Sheet,
  Alert,
  Stack,
  Typography,
  IconButton,
  Tooltip,
  Divider,
  Box,
  ListItemDecorator,
  Chip,
} from '@mui/joy'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Functions as FunctionsIcon,
  Preview as PreviewIcon,
} from '@mui/icons-material'

// ============================================================
// TIPOS EXPORTADOS
// ============================================================

export type CustomColumnOperator = 'divide' | 'multiply' | 'add' | 'subtract' | 'percentage'
export type CustomColumnFormat = 'currency' | 'percent' | 'number' | 'decimal'

export interface CustomColumn {
  id: string
  name: string
  metricA: string
  operator: CustomColumnOperator
  metricB: string
  format: CustomColumnFormat
  createdAt: string
}

interface MetricOption {
  key: string
  label: string
  group: string
}

interface CustomColumnModalProps {
  open: boolean
  onClose: () => void
  onSave: (columns: CustomColumn[]) => void
  columns: CustomColumn[]
  previewData: Record<string, number | undefined> | null
}

// ============================================================
// CATÁLOGO DE MÉTRICAS DISPONIBLES
// ============================================================

export const AVAILABLE_METRICS: MetricOption[] = [
  // Base
  { key: 'impressions', label: 'Impresiones', group: 'Base' },
  { key: 'clicks', label: 'Clics', group: 'Base' },
  { key: 'spend', label: 'Gasto', group: 'Base' },
  { key: 'reach', label: 'Alcance', group: 'Base' },
  { key: 'frequency', label: 'Frecuencia', group: 'Base' },
  { key: 'ctr', label: 'CTR', group: 'Base' },
  { key: 'cpc', label: 'CPC', group: 'Base' },
  { key: 'cpm', label: 'CPM', group: 'Base' },
  // Ventas
  { key: 'landingPageViews', label: 'Landing Page Views', group: 'Ventas' },
  { key: 'costPerLPV', label: 'Costo por LPV', group: 'Ventas' },
  { key: 'addToCart', label: 'Agregar al Carrito', group: 'Ventas' },
  { key: 'initiateCheckout', label: 'Iniciar Checkout', group: 'Ventas' },
  { key: 'purchases', label: 'Compras', group: 'Ventas' },
  { key: 'costPerPurchase', label: 'Costo por Compra', group: 'Ventas' },
  { key: 'conversionValue', label: 'Valor Conversion', group: 'Ventas' },
  { key: 'roas', label: 'ROAS', group: 'Ventas' },
  // Mensajes
  { key: 'conversationsStarted', label: 'Conversaciones Iniciadas', group: 'Mensajes' },
  { key: 'costPerConversation', label: 'Costo por Conversacion', group: 'Mensajes' },
  { key: 'messagingContacts', label: 'Contactos Mensajeria', group: 'Mensajes' },
  { key: 'costPerMessagingContact', label: 'Costo por Contacto Msj', group: 'Mensajes' },
  { key: 'newMessagingConnections', label: 'Nuevos Contactos', group: 'Mensajes' },
  // Leads
  { key: 'leads', label: 'Leads', group: 'Leads' },
  { key: 'costPerLead', label: 'Costo por Lead', group: 'Leads' },
  // Video
  { key: 'videoPlays', label: 'Reproducciones 3s', group: 'Video' },
  { key: 'thruPlays', label: 'ThruPlays', group: 'Video' },
  { key: 'costPerThruPlay', label: 'Costo por ThruPlay', group: 'Video' },
  { key: 'videoP50', label: 'Video 50%', group: 'Video' },
  { key: 'videoP95', label: 'Video 95%', group: 'Video' },
]

const METRIC_GROUPS = ['Base', 'Ventas', 'Mensajes', 'Leads', 'Video']

// ============================================================
// OPERADORES
// ============================================================

const OPERATORS: { value: CustomColumnOperator; label: string; symbol: string; description: string }[] = [
  { value: 'divide', label: 'Dividir', symbol: '÷', description: 'A ÷ B' },
  { value: 'multiply', label: 'Multiplicar', symbol: '×', description: 'A × B' },
  { value: 'add', label: 'Sumar', symbol: '+', description: 'A + B' },
  { value: 'subtract', label: 'Restar', symbol: '−', description: 'A − B' },
  { value: 'percentage', label: 'Porcentaje', symbol: '%', description: '(A ÷ B) × 100' },
]

const FORMAT_OPTIONS: { value: CustomColumnFormat; label: string }[] = [
  { value: 'currency', label: 'Moneda ($)' },
  { value: 'percent', label: 'Porcentaje (%)' },
  { value: 'number', label: 'Número entero' },
  { value: 'decimal', label: 'Decimal (4 dígitos)' },
]

// ============================================================
// FUNCIONES DE EVALUACIÓN EXPORTADAS
// ============================================================

export function evaluateCustomColumn(
  column: CustomColumn,
  insights: Record<string, number | undefined>
): number | null {
  const a = Number(insights[column.metricA]) || 0
  const b = Number(insights[column.metricB]) || 0

  switch (column.operator) {
    case 'divide':
      return b === 0 ? null : a / b
    case 'multiply':
      return a * b
    case 'add':
      return a + b
    case 'subtract':
      return a - b
    case 'percentage':
      return b === 0 ? null : (a / b) * 100
    default:
      return null
  }
}

export function formatCustomValue(
  value: number | null,
  format: CustomColumnFormat,
  formatCurrency: (v: number) => string,
  formatNumber: (v: number) => string,
  formatPercent: (v: number) => string
): string {
  if (value === null || !isFinite(value)) return '—'

  switch (format) {
    case 'currency':
      return formatCurrency(value)
    case 'percent':
      return formatPercent(value)
    case 'number':
      return formatNumber(value)
    case 'decimal':
      return value.toFixed(4)
    default:
      return value.toFixed(2)
  }
}

export function getOperatorSymbol(op: CustomColumnOperator): string {
  const found = OPERATORS.find(o => o.value === op)
  return found ? found.symbol : op
}

// ============================================================
// FUNCIONES INTERNAS DE FORMATO (para vista previa)
// ============================================================

const previewFormatCurrency = (v: number): string =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v)

const previewFormatNumber = (v: number): string =>
  new Intl.NumberFormat('es-ES').format(Math.round(v))

const previewFormatPercent = (v: number): string =>
  `${v.toFixed(2)}%`

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

const CustomColumnModal: React.FC<CustomColumnModalProps> = ({
  open,
  onClose,
  onSave,
  columns,
  previewData,
}) => {
  // Estado del formulario
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [metricA, setMetricA] = useState('')
  const [operator, setOperator] = useState<CustomColumnOperator>('divide')
  const [metricB, setMetricB] = useState('')
  const [format, setFormat] = useState<CustomColumnFormat>('number')

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      resetForm()
    }
  }, [open])

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setMetricA('')
    setOperator('divide')
    setMetricB('')
    setFormat('number')
  }

  // Cargar datos al editar
  const handleEdit = (col: CustomColumn) => {
    setEditingId(col.id)
    setName(col.name)
    setMetricA(col.metricA)
    setOperator(col.operator)
    setMetricB(col.metricB)
    setFormat(col.format)
  }

  // Eliminar columna
  const handleDelete = (id: string) => {
    onSave(columns.filter(c => c.id !== id))
  }

  // Guardar columna (crear o actualizar)
  const handleSave = () => {
    if (!isValid) return

    if (editingId) {
      // Actualizar existente
      const updated = columns.map(c =>
        c.id === editingId
          ? { ...c, name: name.trim(), metricA, operator, metricB, format }
          : c
      )
      onSave(updated)
    } else {
      // Crear nueva
      const newCol: CustomColumn = {
        id: crypto.randomUUID(),
        name: name.trim(),
        metricA,
        operator,
        metricB,
        format,
        createdAt: new Date().toISOString(),
      }
      onSave([...columns, newCol])
    }
    resetForm()
  }

  // Validaciones
  const isDuplicateName = columns.some(
    c => c.name.toLowerCase() === name.trim().toLowerCase() && c.id !== editingId
  )
  const isValid = name.trim() !== '' && metricA !== '' && metricB !== '' && !isDuplicateName

  // Vista previa
  const previewValue = useMemo(() => {
    if (!previewData || !metricA || !metricB) return null
    const tempCol: CustomColumn = {
      id: 'preview',
      name: 'preview',
      metricA,
      operator,
      metricB,
      format,
      createdAt: '',
    }
    return evaluateCustomColumn(tempCol, previewData as Record<string, number | undefined>)
  }, [previewData, metricA, operator, metricB, format])

  const getMetricLabel = (key: string): string => {
    const found = AVAILABLE_METRICS.find(m => m.key === key)
    return found ? found.label : key
  }

  // Generar opciones de Select agrupadas
  const renderMetricOptions = () => {
    const options: React.ReactNode[] = []
    METRIC_GROUPS.forEach(group => {
      const groupMetrics = AVAILABLE_METRICS.filter(m => m.group === group)
      if (groupMetrics.length > 0) {
        // Separador de grupo
        options.push(
          <Option key={`group-${group}`} value={`__group_${group}`} disabled sx={{ fontWeight: 'bold', fontSize: '0.75rem', color: 'text.tertiary', textTransform: 'uppercase', letterSpacing: '0.05em', py: 0.5 }}>
            {group}
          </Option>
        )
        groupMetrics.forEach(m => {
          options.push(
            <Option key={m.key} value={m.key}>
              <ListItemDecorator sx={{ minWidth: 0 }}>
                <Chip size="sm" variant="soft" color={
                  group === 'Base' ? 'neutral' :
                  group === 'Ventas' ? 'success' :
                  group === 'Mensajes' ? 'primary' :
                  group === 'Leads' ? 'warning' : 'neutral'
                } sx={{ mr: 1, fontSize: '0.65rem' }}>
                  {group}
                </Chip>
              </ListItemDecorator>
              {m.label}
            </Option>
          )
        })
      }
    })
    return options
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          minWidth: { xs: '95vw', sm: 650 },
          maxWidth: 700,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <ModalClose />
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <FunctionsIcon color="primary" />
            <Typography level="h4">Columnas Personalizadas</Typography>
            {columns.length > 0 && (
              <Chip size="sm" color="primary" variant="solid">
                {columns.length}
              </Chip>
            )}
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ overflow: 'visible' }}>
          <Stack spacing={2.5}>

            {/* ============ LISTA DE COLUMNAS EXISTENTES ============ */}
            {columns.length > 0 && (
              <Box>
                <Typography level="title-sm" sx={{ mb: 1, color: 'text.secondary' }}>
                  Columnas activas
                </Typography>
                <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'hidden' }}>
                  <Table size="sm" sx={{ '& th': { bgcolor: 'background.level1' } }}>
                    <thead>
                      <tr>
                        <th style={{ width: '35%' }}>Nombre</th>
                        <th style={{ width: '40%' }}>Formula</th>
                        <th style={{ width: '12%' }}>Formato</th>
                        <th style={{ width: '13%', textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map(col => (
                        <tr key={col.id} style={editingId === col.id ? { backgroundColor: 'var(--joy-palette-primary-softBg)' } : undefined}>
                          <td>
                            <Typography level="body-sm" fontWeight="bold">
                              {col.name}
                            </Typography>
                          </td>
                          <td>
                            <Typography level="body-xs" sx={{ fontFamily: 'monospace' }}>
                              {getMetricLabel(col.metricA)} {getOperatorSymbol(col.operator)} {getMetricLabel(col.metricB)}
                            </Typography>
                          </td>
                          <td>
                            <Chip size="sm" variant="soft" color="neutral">
                              {FORMAT_OPTIONS.find(f => f.value === col.format)?.label || col.format}
                            </Chip>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Stack direction="row" spacing={0.5} justifyContent="center">
                              <Tooltip title="Editar">
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="primary"
                                  onClick={() => handleEdit(col)}
                                >
                                  <EditIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Eliminar">
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="danger"
                                  onClick={() => handleDelete(col.id)}
                                >
                                  <DeleteIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Sheet>
              </Box>
            )}

            {columns.length > 0 && <Divider />}

            {/* ============ FORMULARIO ============ */}
            <Box>
              <Typography level="title-sm" sx={{ mb: 1.5, color: 'text.secondary' }}>
                {editingId ? 'Editar columna' : 'Nueva columna'}
              </Typography>

              {/* Nombre */}
              <FormControl sx={{ mb: 2 }}>
                <FormLabel>Nombre de la columna</FormLabel>
                <Input
                  placeholder="Ej: Costo por Conversacion Real"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  error={isDuplicateName}
                  size="sm"
                />
                {isDuplicateName && (
                  <Typography level="body-xs" color="danger" sx={{ mt: 0.5 }}>
                    Ya existe una columna con este nombre
                  </Typography>
                )}
              </FormControl>

              {/* Fórmula: Métrica A — Operador — Métrica B */}
              <Typography level="body-xs" sx={{ mb: 1, color: 'text.tertiary', fontWeight: 'bold' }}>
                Formula
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-end" sx={{ mb: 2 }}>
                {/* Métrica A */}
                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Metrica A</FormLabel>
                  <Select
                    size="sm"
                    placeholder="Seleccionar..."
                    value={metricA}
                    onChange={(_, val) => setMetricA(val as string || '')}
                  >
                    {renderMetricOptions()}
                  </Select>
                </FormControl>

                {/* Operador */}
                <FormControl sx={{ minWidth: 130 }}>
                  <FormLabel>Operador</FormLabel>
                  <Select
                    size="sm"
                    value={operator}
                    onChange={(_, val) => setOperator(val as CustomColumnOperator || 'divide')}
                  >
                    {OPERATORS.map(op => (
                      <Option key={op.value} value={op.value}>
                        <Typography component="span" sx={{ fontFamily: 'monospace', fontWeight: 'bold', mr: 0.5 }}>
                          {op.symbol}
                        </Typography>
                        {op.label}
                      </Option>
                    ))}
                  </Select>
                </FormControl>

                {/* Métrica B */}
                <FormControl sx={{ flex: 1 }}>
                  <FormLabel>Metrica B</FormLabel>
                  <Select
                    size="sm"
                    placeholder="Seleccionar..."
                    value={metricB}
                    onChange={(_, val) => setMetricB(val as string || '')}
                  >
                    {renderMetricOptions()}
                  </Select>
                </FormControl>
              </Stack>

              {/* Formato */}
              <FormControl sx={{ mb: 2, maxWidth: 250 }}>
                <FormLabel>Formato del resultado</FormLabel>
                <Select
                  size="sm"
                  value={format}
                  onChange={(_, val) => setFormat(val as CustomColumnFormat || 'number')}
                >
                  {FORMAT_OPTIONS.map(f => (
                    <Option key={f.value} value={f.value}>{f.label}</Option>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* ============ VISTA PREVIA ============ */}
            {metricA && metricB && previewData && (
              <Alert
                color={previewValue !== null ? 'success' : 'warning'}
                variant="soft"
                startDecorator={<PreviewIcon />}
                sx={{ borderRadius: 'sm' }}
              >
                <Stack>
                  <Typography level="body-xs" fontWeight="bold">
                    Vista previa (primera campana)
                  </Typography>
                  <Typography level="body-sm" sx={{ fontFamily: 'monospace' }}>
                    {getMetricLabel(metricA)} ({previewData[metricA] ?? 0})
                    {' '}{getOperatorSymbol(operator)}{' '}
                    {getMetricLabel(metricB)} ({previewData[metricB] ?? 0})
                    {' = '}
                    <Typography component="span" fontWeight="bold" color={previewValue !== null ? 'success' : 'danger'}>
                      {formatCustomValue(previewValue, format, previewFormatCurrency, previewFormatNumber, previewFormatPercent)}
                    </Typography>
                  </Typography>
                </Stack>
              </Alert>
            )}

            {/* ============ BOTONES ============ */}
            <Stack direction="row" justifyContent="flex-end" spacing={1.5} sx={{ pt: 1 }}>
              {editingId && (
                <Button
                  size="sm"
                  variant="plain"
                  color="neutral"
                  onClick={resetForm}
                >
                  Cancelar edicion
                </Button>
              )}
              <Button
                size="sm"
                variant="plain"
                color="neutral"
                onClick={onClose}
              >
                Cerrar
              </Button>
              <Button
                size="sm"
                variant="solid"
                color="primary"
                disabled={!isValid}
                startDecorator={editingId ? <EditIcon /> : <AddIcon />}
                onClick={handleSave}
              >
                {editingId ? 'Actualizar Columna' : 'Agregar Columna'}
              </Button>
            </Stack>

          </Stack>
        </DialogContent>
      </ModalDialog>
    </Modal>
  )
}

export default CustomColumnModal
