import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Input,
  Textarea,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Grid,
  Chip,
  IconButton,
  Select,
  Option,
  Table,
  Sheet,
  Divider,
} from '@mui/joy'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Search as SearchIcon,
  PlayArrow as TestIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Code as CodeIcon,
} from '@mui/icons-material'

interface Prompt {
  id: number
  name: string
  description: string
  category: string
  content: string
  variables: string[]
  model: string
  temperature: number
  maxTokens: number
  usageCount: number
  avgCost: number
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export default function OpenAIPrompts() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [openModal, setOpenModal] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)

  const [prompts] = useState<Prompt[]>([
    {
      id: 1,
      name: 'Análisis de Sentimiento',
      description: 'Analiza el sentimiento de un mensaje de cliente y clasifica como positivo, negativo o neutral',
      category: 'Análisis',
      content: 'Analiza el siguiente mensaje y determina su sentimiento (positivo, negativo, neutral). También indica el nivel de urgencia y la emoción principal.\n\nMensaje: {mensaje}\n\nResponde en formato JSON con: sentimiento, urgencia (1-10), emocion, razonamiento',
      variables: ['mensaje'],
      model: 'GPT-4 Turbo',
      temperature: 0.3,
      maxTokens: 500,
      usageCount: 1250,
      avgCost: 0.025,
      favorite: true,
      createdAt: '2025-09-15',
      updatedAt: '2025-10-10',
    },
    {
      id: 2,
      name: 'Generador de Respuestas',
      description: 'Genera respuestas profesionales y empáticas para mensajes de clientes',
      category: 'Generación',
      content: 'Genera una respuesta profesional y empática para el siguiente mensaje de cliente. La respuesta debe ser clara, concisa y resolver la consulta.\n\nMensaje del cliente: {mensaje}\nContexto adicional: {contexto}\nTono deseado: {tono}\n\nGenera la respuesta en español, máximo 2 párrafos.',
      variables: ['mensaje', 'contexto', 'tono'],
      model: 'GPT-3.5 Turbo',
      temperature: 0.7,
      maxTokens: 300,
      usageCount: 3450,
      avgCost: 0.008,
      favorite: true,
      createdAt: '2025-08-20',
      updatedAt: '2025-10-12',
    },
    {
      id: 3,
      name: 'Resumen de Conversación',
      description: 'Genera un resumen conciso de una conversación completa',
      category: 'Resumen',
      content: 'Resume la siguiente conversación entre agente y cliente. Identifica:\n1. Problema principal\n2. Solución propuesta\n3. Estado actual\n4. Próximos pasos\n\nConversación:\n{conversacion}\n\nGenera el resumen en formato de lista con bullets.',
      variables: ['conversacion'],
      model: 'GPT-4 Turbo',
      temperature: 0.5,
      maxTokens: 600,
      usageCount: 890,
      avgCost: 0.032,
      favorite: false,
      createdAt: '2025-09-01',
      updatedAt: '2025-10-08',
    },
    {
      id: 4,
      name: 'Clasificación de Intención',
      description: 'Clasifica la intención del mensaje del cliente',
      category: 'Clasificación',
      content: 'Clasifica la intención del siguiente mensaje en una de estas categorías:\n- Consulta: El cliente busca información\n- Reclamo: El cliente está insatisfecho\n- Solicitud: El cliente pide algo específico\n- Agradecimiento: El cliente agradece\n- Otro: No encaja en las anteriores\n\nMensaje: {mensaje}\n\nResponde en formato JSON: {"intencion": "...", "confianza": 0-100, "subcategoria": "..."}',
      variables: ['mensaje'],
      model: 'Gemini Pro',
      temperature: 0.2,
      maxTokens: 200,
      usageCount: 2100,
      avgCost: 0.004,
      favorite: true,
      createdAt: '2025-09-10',
      updatedAt: '2025-10-11',
    },
    {
      id: 5,
      name: 'Extracción de Entidades',
      description: 'Extrae información relevante como nombres, emails, teléfonos, etc.',
      category: 'Extracción',
      content: 'Extrae las siguientes entidades del mensaje:\n- Nombre completo\n- Email\n- Teléfono\n- Empresa\n- Dirección\n- Fecha/Hora mencionada\n- Monto/Precio mencionado\n- Número de orden/ticket\n\nMensaje: {mensaje}\n\nResponde en formato JSON con las entidades encontradas. Si no encuentras alguna, usa null.',
      variables: ['mensaje'],
      model: 'GPT-3.5 Turbo',
      temperature: 0.1,
      maxTokens: 400,
      usageCount: 1680,
      avgCost: 0.006,
      favorite: false,
      createdAt: '2025-09-25',
      updatedAt: '2025-10-09',
    },
  ])

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'Análisis',
    content: '',
    variables: '',
    model: 'GPT-4 Turbo',
    temperature: 0.7,
    maxTokens: 500,
  })

  const filteredPrompts = prompts.filter((prompt) => {
    const matchesSearch =
      prompt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = filterCategory === 'all' || prompt.category === filterCategory
    return matchesSearch && matchesCategory
  })

  const handleCreate = () => {
    setEditingPrompt(null)
    setFormData({
      name: '',
      description: '',
      category: 'Análisis',
      content: '',
      variables: '',
      model: 'GPT-4 Turbo',
      temperature: 0.7,
      maxTokens: 500,
    })
    setOpenModal(true)
  }

  const handleEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt)
    setFormData({
      name: prompt.name,
      description: prompt.description,
      category: prompt.category,
      content: prompt.content,
      variables: prompt.variables.join(', '),
      model: prompt.model,
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens,
    })
    setOpenModal(true)
  }

  const handleSave = () => {
    console.log('Guardando prompt:', formData)
    setOpenModal(false)
  }

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content)
    console.log('Prompt copiado al portapapeles')
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, any> = {
      'Análisis': 'primary',
      'Generación': 'success',
      'Resumen': 'warning',
      'Clasificación': 'info',
      'Extracción': 'danger',
    }
    return colors[category] || 'neutral'
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1 }}>
            Biblioteca de Prompts
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Gestiona y reutiliza prompts optimizados para diferentes casos de uso
          </Typography>
        </Box>
        <Button startDecorator={<AddIcon />} onClick={handleCreate}>
          Crear Prompt
        </Button>
      </Box>

      {/* Filtros */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} md={6}>
          <Input
            placeholder="Buscar por nombre o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            startDecorator={<SearchIcon />}
          />
        </Grid>
        <Grid xs={12} md={3}>
          <Select value={filterCategory} onChange={(_, val) => setFilterCategory(val as string)}>
            <Option value="all">Todas las categorías</Option>
            <Option value="Análisis">Análisis</Option>
            <Option value="Generación">Generación</Option>
            <Option value="Resumen">Resumen</Option>
            <Option value="Clasificación">Clasificación</Option>
            <Option value="Extracción">Extracción</Option>
          </Select>
        </Grid>
        <Grid xs={12} md={3}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip size="sm">Total: {filteredPrompts.length}</Chip>
            <Chip size="sm" color="warning" startDecorator={<StarIcon />}>
              Favoritos: {prompts.filter((p) => p.favorite).length}
            </Chip>
          </Box>
        </Grid>
      </Grid>

      {/* Tabla de Prompts */}
      <Card>
        <CardContent>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th style={{ width: 200 }}>Nombre</th>
                  <th>Descripción</th>
                  <th style={{ width: 120 }}>Categoría</th>
                  <th style={{ width: 120 }}>Modelo</th>
                  <th style={{ width: 100 }}>Uso</th>
                  <th style={{ width: 100 }}>Costo Prom.</th>
                  <th style={{ width: 150, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrompts.map((prompt) => (
                  <tr key={prompt.id}>
                    <td>
                      <IconButton size="sm" variant="plain" color={prompt.favorite ? 'warning' : 'neutral'}>
                        {prompt.favorite ? <StarIcon /> : <StarBorderIcon />}
                      </IconButton>
                    </td>
                    <td>
                      <Typography level="title-sm">{prompt.name}</Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Actualizado: {prompt.updatedAt}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">{prompt.description}</Typography>
                      {prompt.variables.length > 0 && (
                        <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {prompt.variables.map((variable) => (
                            <Chip key={variable} size="sm" variant="outlined" startDecorator={<CodeIcon />}>
                              {variable}
                            </Chip>
                          ))}
                        </Box>
                      )}
                    </td>
                    <td>
                      <Chip size="sm" color={getCategoryColor(prompt.category)}>
                        {prompt.category}
                      </Chip>
                    </td>
                    <td>
                      <Typography level="body-sm">{prompt.model}</Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Temp: {prompt.temperature}
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">{prompt.usageCount.toLocaleString()}</Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        requests
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">${prompt.avgCost.toFixed(3)}</Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        por request
                      </Typography>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <IconButton size="sm" variant="outlined" color="primary" onClick={() => console.log('Test prompt', prompt.id)}>
                          <TestIcon />
                        </IconButton>
                        <IconButton size="sm" variant="outlined" onClick={() => handleCopy(prompt.content)}>
                          <CopyIcon />
                        </IconButton>
                        <IconButton size="sm" variant="outlined" onClick={() => handleEdit(prompt)}>
                          <EditIcon />
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

      {/* Modal Crear/Editar */}
      <Modal open={openModal} onClose={() => setOpenModal(false)}>
        <ModalDialog sx={{ minWidth: 700, maxWidth: 900 }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            {editingPrompt ? 'Editar Prompt' : 'Crear Nuevo Prompt'}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Grid container spacing={2}>
              <Grid xs={12} md={8}>
                <FormControl required>
                  <FormLabel>Nombre del Prompt</FormLabel>
                  <Input
                    placeholder="Ej: Análisis de Sentimiento"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </FormControl>
              </Grid>
              <Grid xs={12} md={4}>
                <FormControl required>
                  <FormLabel>Categoría</FormLabel>
                  <Select value={formData.category} onChange={(_, val) => setFormData({ ...formData, category: val as string })}>
                    <Option value="Análisis">Análisis</Option>
                    <Option value="Generación">Generación</Option>
                    <Option value="Resumen">Resumen</Option>
                    <Option value="Clasificación">Clasificación</Option>
                    <Option value="Extracción">Extracción</Option>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <FormControl required>
              <FormLabel>Descripción</FormLabel>
              <Input
                placeholder="Describe brevemente para qué sirve este prompt"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </FormControl>

            <FormControl required>
              <FormLabel>Contenido del Prompt</FormLabel>
              <Textarea
                minRows={8}
                placeholder="Escribe el prompt aquí. Usa {variable} para variables dinámicas..."
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              />
              <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                Usa llaves para definir variables: {'{variable}'}, {'{contexto}'}, {'{mensaje}'}
              </Typography>
            </FormControl>

            <FormControl>
              <FormLabel>Variables (separadas por coma)</FormLabel>
              <Input
                placeholder="mensaje, contexto, tono"
                value={formData.variables}
                onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
              />
            </FormControl>

            <Divider />

            <Typography level="title-sm">Configuración del Modelo</Typography>

            <Grid container spacing={2}>
              <Grid xs={12} md={4}>
                <FormControl required>
                  <FormLabel>Modelo</FormLabel>
                  <Select value={formData.model} onChange={(_, val) => setFormData({ ...formData, model: val as string })}>
                    <Option value="GPT-4 Turbo">GPT-4 Turbo</Option>
                    <Option value="GPT-3.5 Turbo">GPT-3.5 Turbo</Option>
                    <Option value="Gemini Pro">Gemini Pro</Option>
                    <Option value="DeepSeek">DeepSeek</Option>
                    <Option value="Claude 3.5">Claude 3.5</Option>
                  </Select>
                </FormControl>
              </Grid>
              <Grid xs={12} md={4}>
                <FormControl required>
                  <FormLabel>Temperature (0-1)</FormLabel>
                  <Input
                    type="number"
                    slotProps={{ input: { min: 0, max: 1, step: 0.1 } }}
                    value={formData.temperature}
                    onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                  />
                  <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                    0 = Determinístico, 1 = Creativo
                  </Typography>
                </FormControl>
              </Grid>
              <Grid xs={12} md={4}>
                <FormControl required>
                  <FormLabel>Max Tokens</FormLabel>
                  <Input
                    type="number"
                    slotProps={{ input: { min: 100, max: 4000, step: 100 } }}
                    value={formData.maxTokens}
                    onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) })}
                  />
                </FormControl>
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
              <Button variant="outlined" onClick={() => setOpenModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>{editingPrompt ? 'Guardar Cambios' : 'Crear Prompt'}</Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  )
}
