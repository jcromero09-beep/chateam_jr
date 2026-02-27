import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Input,
  Select,
  Option,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Modal,
  ModalDialog,
  ModalClose,
  Divider,
} from '@mui/joy'
import {
  History as HistoryIcon,
  Search as SearchIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  FilterList as FilterIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
} from '@mui/icons-material'

interface HistoryEntry {
  id: number
  timestamp: string
  user: string
  model: string
  category: string
  prompt: string
  response: string
  tokens: number
  cost: number
  duration: number
  status: 'success' | 'error'
  errorMessage?: string
}

export default function OpenAIHistory() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterModel, setFilterModel] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDate, setFilterDate] = useState('7d')
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null)

  const [history] = useState<HistoryEntry[]>([
    {
      id: 1,
      timestamp: '2025-10-13 14:35:22',
      user: 'admin@empresa.com',
      model: 'GPT-4 Turbo',
      category: 'Análisis',
      prompt: 'Analiza el sentimiento del siguiente mensaje: "Estoy muy contento con el servicio"',
      response: '{\n  "sentimiento": "positivo",\n  "confianza": 95,\n  "emocion": "alegría",\n  "urgencia": 2,\n  "razonamiento": "El mensaje expresa satisfacción clara con el servicio"\n}',
      tokens: 85,
      cost: 0.00255,
      duration: 1.2,
      status: 'success',
    },
    {
      id: 2,
      timestamp: '2025-10-13 14:30:15',
      user: 'agent1@empresa.com',
      model: 'GPT-3.5 Turbo',
      category: 'Generación',
      prompt: 'Genera una respuesta profesional para: "¿Cuándo recibiré mi pedido?"',
      response: 'Estimado/a cliente,\n\nGracias por contactarnos. Su pedido está siendo procesado y será enviado en las próximas 24-48 horas. Recibirá un email con el número de seguimiento una vez despachado.\n\nQuedamos a su disposición para cualquier consulta.\n\nSaludos cordiales',
      tokens: 120,
      cost: 0.00012,
      duration: 0.8,
      status: 'success',
    },
    {
      id: 3,
      timestamp: '2025-10-13 14:28:45',
      user: 'agent2@empresa.com',
      model: 'Gemini Pro',
      category: 'Clasificación',
      prompt: 'Clasifica la intención: "Necesito cancelar mi suscripción urgentemente"',
      response: '{\n  "categoria_principal": "Solicitud",\n  "categorias_secundarias": ["Urgente", "Cancelación"],\n  "confianza": 98,\n  "requiere_escalamiento": true\n}',
      tokens: 65,
      cost: 0.00003,
      duration: 0.9,
      status: 'success',
    },
    {
      id: 4,
      timestamp: '2025-10-13 14:25:10',
      user: 'admin@empresa.com',
      model: 'GPT-4 Turbo',
      category: 'Resumen',
      prompt: 'Resume la siguiente conversación de 50 mensajes...',
      response: '',
      tokens: 0,
      cost: 0,
      duration: 5.2,
      status: 'error',
      errorMessage: 'Timeout: Request took longer than 5 seconds',
    },
    {
      id: 5,
      timestamp: '2025-10-13 14:20:33',
      user: 'agent3@empresa.com',
      model: 'DeepSeek',
      category: 'Extracción',
      prompt: 'Extrae datos del mensaje: "Mi nombre es Juan Pérez, email juan@example.com, pedido #12345"',
      response: '{\n  "cliente": {\n    "nombre": "Juan Pérez",\n    "email": "juan@example.com"\n  },\n  "solicitud": {\n    "tipo": "consulta",\n    "descripcion": "pedido"\n  },\n  "referencias": {\n    "orden": "12345"\n  }\n}',
      tokens: 95,
      cost: 0.00013,
      duration: 1.1,
      status: 'success',
    },
    {
      id: 6,
      timestamp: '2025-10-13 14:15:18',
      user: 'agent1@empresa.com',
      model: 'GPT-3.5 Turbo',
      category: 'Traducción',
      prompt: 'Traduce de ES a EN: "Gracias por su compra"',
      response: 'Thank you for your purchase',
      tokens: 15,
      cost: 0.000015,
      duration: 0.4,
      status: 'success',
    },
    {
      id: 7,
      timestamp: '2025-10-13 14:10:55',
      user: 'admin@empresa.com',
      model: 'GPT-4 Turbo',
      category: 'Análisis',
      prompt: 'Analiza el sentimiento de 20 mensajes...',
      response: '[Análisis de 20 mensajes con sentimiento, urgencia y recomendaciones...]',
      tokens: 850,
      cost: 0.0255,
      duration: 3.5,
      status: 'success',
    },
    {
      id: 8,
      timestamp: '2025-10-13 14:05:42',
      user: 'agent2@empresa.com',
      model: 'Gemini Pro',
      category: 'Generación',
      prompt: 'Genera un email de bienvenida para nuevo cliente',
      response: '',
      tokens: 0,
      cost: 0,
      duration: 0.1,
      status: 'error',
      errorMessage: 'API Error: Invalid API key',
    },
  ])

  const filteredHistory = history.filter((entry) => {
    const matchesSearch =
      entry.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.category.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesModel = filterModel === 'all' || entry.model === filterModel
    const matchesStatus = filterStatus === 'all' || entry.status === filterStatus
    return matchesSearch && matchesModel && matchesStatus
  })

  const totalEntries = filteredHistory.length
  const totalTokens = filteredHistory.reduce((sum, entry) => sum + entry.tokens, 0)
  const totalCost = filteredHistory.reduce((sum, entry) => sum + entry.cost, 0)
  const successRate = (filteredHistory.filter((e) => e.status === 'success').length / totalEntries * 100).toFixed(1)

  const handleViewDetail = (entry: HistoryEntry) => {
    setSelectedEntry(entry)
  }

  const handleExport = () => {
    console.log('Exportando historial...')
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon sx={{ fontSize: 32 }} />
            Historial de IA
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Registro completo de todas las interacciones con modelos de IA
          </Typography>
        </Box>
        <Button variant="outlined" startDecorator={<DownloadIcon />} onClick={handleExport}>
          Exportar CSV
        </Button>
      </Box>

      {/* Estadísticas */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total Entries
              </Typography>
              <Typography level="h3">{totalEntries}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total Tokens
              </Typography>
              <Typography level="h3">{totalTokens.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Costo Total
              </Typography>
              <Typography level="h3">${totalCost.toFixed(4)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Tasa de Éxito
              </Typography>
              <Typography level="h3">{successRate}%</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filtros */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid xs={12} md={3}>
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                startDecorator={<SearchIcon />}
              />
            </Grid>
            <Grid xs={12} md={2}>
              <Select value={filterModel} onChange={(_, val) => setFilterModel(val as string)}>
                <Option value="all">Todos los modelos</Option>
                <Option value="GPT-4 Turbo">GPT-4 Turbo</Option>
                <Option value="GPT-3.5 Turbo">GPT-3.5 Turbo</Option>
                <Option value="Gemini Pro">Gemini Pro</Option>
                <Option value="DeepSeek">DeepSeek</Option>
              </Select>
            </Grid>
            <Grid xs={12} md={2}>
              <Select value={filterStatus} onChange={(_, val) => setFilterStatus(val as string)}>
                <Option value="all">Todos los estados</Option>
                <Option value="success">Exitosos</Option>
                <Option value="error">Con errores</Option>
              </Select>
            </Grid>
            <Grid xs={12} md={2}>
              <Select value={filterDate} onChange={(_, val) => setFilterDate(val as string)}>
                <Option value="24h">Últimas 24h</Option>
                <Option value="7d">Últimos 7 días</Option>
                <Option value="30d">Últimos 30 días</Option>
                <Option value="90d">Últimos 90 días</Option>
              </Select>
            </Grid>
            <Grid xs={12} md={3}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip size="sm" startDecorator={<FilterIcon />}>
                  {totalEntries} resultados
                </Chip>
                <Chip size="sm" color="success">
                  {filteredHistory.filter((e) => e.status === 'success').length} éxito
                </Chip>
                <Chip size="sm" color="danger">
                  {filteredHistory.filter((e) => e.status === 'error').length} error
                </Chip>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabla de Historial */}
      <Card>
        <CardContent>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Timestamp</th>
                  <th style={{ width: 150 }}>Usuario</th>
                  <th style={{ width: 120 }}>Modelo</th>
                  <th style={{ width: 100 }}>Categoría</th>
                  <th>Prompt</th>
                  <th style={{ width: 80 }}>Tokens</th>
                  <th style={{ width: 80 }}>Costo</th>
                  <th style={{ width: 80 }}>Duración</th>
                  <th style={{ width: 100 }}>Estado</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <Typography level="body-xs">{entry.timestamp}</Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">{entry.user.split('@')[0]}</Typography>
                    </td>
                    <td>
                      <Chip size="sm" variant="outlined">
                        {entry.model}
                      </Chip>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft">
                        {entry.category}
                      </Chip>
                    </td>
                    <td>
                      <Typography
                        level="body-sm"
                        sx={{
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.prompt}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">{entry.tokens}</Typography>
                    </td>
                    <td>
                      <Typography level="body-sm" sx={{ fontFamily: 'monospace' }}>
                        ${entry.cost.toFixed(5)}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">{entry.duration}s</Typography>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        color={entry.status === 'success' ? 'success' : 'danger'}
                        startDecorator={entry.status === 'success' ? <SuccessIcon /> : <ErrorIcon />}
                      >
                        {entry.status}
                      </Chip>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <IconButton size="sm" variant="outlined" onClick={() => handleViewDetail(entry)}>
                          <ViewIcon />
                        </IconButton>
                        <IconButton size="sm" variant="outlined" color="danger">
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Sheet>
        </CardContent>
      </Card>

      {/* Modal de Detalle */}
      <Modal open={selectedEntry !== null} onClose={() => setSelectedEntry(null)}>
        <ModalDialog sx={{ minWidth: 700, maxWidth: 900 }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Detalle de Interacción
          </Typography>

          {selectedEntry && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Grid container spacing={2}>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Timestamp
                  </Typography>
                  <Typography level="body-md">{selectedEntry.timestamp}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Usuario
                  </Typography>
                  <Typography level="body-md">{selectedEntry.user}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Modelo
                  </Typography>
                  <Typography level="body-md">{selectedEntry.model}</Typography>
                </Grid>
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Categoría
                  </Typography>
                  <Typography level="body-md">{selectedEntry.category}</Typography>
                </Grid>
              </Grid>

              <Divider />

              <Box>
                <Typography level="title-sm" sx={{ mb: 1 }}>
                  Prompt Enviado
                </Typography>
                <Box
                  sx={{
                    p: 2,
                    bgcolor: 'background.level1',
                    borderRadius: 'sm',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 200,
                    overflow: 'auto',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  {selectedEntry.prompt}
                </Box>
              </Box>

              <Box>
                <Typography level="title-sm" sx={{ mb: 1 }}>
                  Respuesta del Modelo
                </Typography>
                {selectedEntry.status === 'success' ? (
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: 'background.level1',
                      borderRadius: 'sm',
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 300,
                      overflow: 'auto',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    {selectedEntry.response}
                  </Box>
                ) : (
                  <Card color="danger" variant="outlined">
                    <CardContent>
                      <Typography level="body-sm">Error: {selectedEntry.errorMessage}</Typography>
                    </CardContent>
                  </Card>
                )}
              </Box>

              <Divider />

              <Grid container spacing={2}>
                <Grid xs={4}>
                  <Card variant="outlined" size="sm">
                    <CardContent>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                        Tokens Utilizados
                      </Typography>
                      <Typography level="title-md">{selectedEntry.tokens}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid xs={4}>
                  <Card variant="outlined" size="sm">
                    <CardContent>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                        Costo
                      </Typography>
                      <Typography level="title-md">${selectedEntry.cost.toFixed(5)}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid xs={4}>
                  <Card variant="outlined" size="sm">
                    <CardContent>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                        Duración
                      </Typography>
                      <Typography level="title-md">{selectedEntry.duration}s</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}
        </ModalDialog>
      </Modal>
    </Box>
  )
}
