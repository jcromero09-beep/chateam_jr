import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Input,
  FormControl,
  FormLabel,
  Grid,
  Select,
  Option,
  Textarea,
  Alert,
  Chip,
} from '@mui/joy'
import {
  Send as SendIcon,
  Science as ScienceIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Image as ImageIcon,
  Description as DocumentIcon,
} from '@mui/icons-material'

interface TestResult {
  id: number
  timestamp: string
  type: string
  status: 'success' | 'error'
  response: string
  duration: number
}

export default function WhatsAppTester() {
  const [phoneNumber, setPhoneNumber] = useState('+1555')
  const [messageType, setMessageType] = useState('text')
  const [messageContent, setMessageContent] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [loading, setLoading] = useState(false)

  const [testResults, setTestResults] = useState<TestResult[]>([
    {
      id: 1,
      timestamp: '2025-10-13 10:45:32',
      type: 'text',
      status: 'success',
      response: '{"messages":[{"id":"wamid.xxxxx"}]}',
      duration: 234,
    },
    {
      id: 2,
      timestamp: '2025-10-13 10:40:15',
      type: 'template',
      status: 'success',
      response: '{"messages":[{"id":"wamid.yyyyy"}]}',
      duration: 189,
    },
  ])

  const handleSendTest = () => {
    setLoading(true)
    // Simular envío
    setTimeout(() => {
      const newResult: TestResult = {
        id: Date.now(),
        timestamp: new Date().toLocaleString('es-ES'),
        type: messageType,
        status: 'success',
        response: JSON.stringify({ messages: [{ id: `wamid.${Date.now()}` }] }, null, 2),
        duration: Math.floor(Math.random() * 500) + 100,
      }
      setTestResults([newResult, ...testResults])
      setLoading(false)
    }, 1000)
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScienceIcon sx={{ fontSize: 32 }} />
          Herramienta de Testing WhatsApp
        </Typography>
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
          Prueba el envío de mensajes y templates de WhatsApp Business API
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Configurar Mensaje de Prueba
              </Typography>

              <FormControl sx={{ mb: 2 }}>
                <FormLabel>Número de Teléfono Destino</FormLabel>
                <Input
                  placeholder="+1 555-0000"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  startDecorator="+52"
                />
                <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                  Incluye el código de país (ej: +52 para México)
                </Typography>
              </FormControl>

              <FormControl sx={{ mb: 2 }}>
                <FormLabel>Tipo de Mensaje</FormLabel>
                <Select value={messageType} onChange={(_, val) => setMessageType(val as string)}>
                  <Option value="text">Texto Simple</Option>
                  <Option value="template">Template Aprobado</Option>
                  <Option value="image">Imagen</Option>
                  <Option value="document">Documento</Option>
                  <Option value="location">Ubicación</Option>
                </Select>
              </FormControl>

              {messageType === 'text' && (
                <FormControl sx={{ mb: 2 }}>
                  <FormLabel>Contenido del Mensaje</FormLabel>
                  <Textarea
                    minRows={3}
                    placeholder="Escribe tu mensaje de prueba aquí..."
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                  />
                </FormControl>
              )}

              {messageType === 'template' && (
                <>
                  <FormControl sx={{ mb: 2 }}>
                    <FormLabel>Seleccionar Template</FormLabel>
                    <Select value={templateName} onChange={(_, val) => setTemplateName(val as string)}>
                      <Option value="bienvenida_cliente">bienvenida_cliente</Option>
                      <Option value="confirmacion_pedido">confirmacion_pedido</Option>
                      <Option value="codigo_verificacion">codigo_verificacion</Option>
                    </Select>
                  </FormControl>

                  <FormControl sx={{ mb: 2 }}>
                    <FormLabel>Variables (JSON)</FormLabel>
                    <Textarea
                      minRows={2}
                      placeholder='{"1": "Juan", "2": "JR Chateam"}'
                      defaultValue='{"1": "Cliente", "2": "JR Chateam"}'
                    />
                  </FormControl>
                </>
              )}

              {messageType === 'image' && (
                <FormControl sx={{ mb: 2 }}>
                  <FormLabel>URL de la Imagen</FormLabel>
                  <Input
                    placeholder="https://example.com/image.jpg"
                    startDecorator={<ImageIcon />}
                  />
                </FormControl>
              )}

              {messageType === 'document' && (
                <FormControl sx={{ mb: 2 }}>
                  <FormLabel>URL del Documento</FormLabel>
                  <Input
                    placeholder="https://example.com/document.pdf"
                    startDecorator={<DocumentIcon />}
                  />
                </FormControl>
              )}

              {messageType === 'location' && (
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid xs={6}>
                    <FormControl>
                      <FormLabel>Latitud</FormLabel>
                      <Input placeholder="19.432608" />
                    </FormControl>
                  </Grid>
                  <Grid xs={6}>
                    <FormControl>
                      <FormLabel>Longitud</FormLabel>
                      <Input placeholder="-99.133209" />
                    </FormControl>
                  </Grid>
                </Grid>
              )}

              <Alert color="warning" sx={{ mb: 2 }}>
                <Typography level="body-sm">
                  El mensaje de prueba se enviará utilizando la API de WhatsApp Cloud API v20+
                </Typography>
              </Alert>

              <Button
                fullWidth
                size="lg"
                startDecorator={<SendIcon />}
                loading={loading}
                onClick={handleSendTest}
                disabled={!phoneNumber || (messageType === 'text' && !messageContent)}
              >
                Enviar Mensaje de Prueba
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                Resultados de Pruebas
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {testResults.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                      No hay resultados de pruebas aún. Envía un mensaje para comenzar.
                    </Typography>
                  </Box>
                ) : (
                  testResults.map((result) => (
                    <Card key={result.id} variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Chip
                              size="sm"
                              color={result.status === 'success' ? 'success' : 'danger'}
                              startDecorator={
                                result.status === 'success' ? <CheckCircleIcon /> : <ErrorIcon />
                              }
                            >
                              {result.status}
                            </Chip>
                            <Chip size="sm" variant="outlined">
                              {result.type}
                            </Chip>
                          </Box>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {result.duration}ms
                          </Typography>
                        </Box>

                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1 }}>
                          {result.timestamp}
                        </Typography>

                        <Box sx={{ mt: 2 }}>
                          <Typography level="body-sm" fontWeight="lg" sx={{ mb: 0.5 }}>
                            Respuesta de la API:
                          </Typography>
                          <Box sx={{
                            display: 'block',
                            p: 1,
                            fontSize: '0.75rem',
                            overflow: 'auto',
                            bgcolor: 'background.level1',
                            borderRadius: 'sm',
                            fontFamily: 'monospace',
                            border: '1px solid',
                            borderColor: 'divider'
                          }}>
                            <pre style={{ margin: 0 }}>{result.response}</pre>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  ))
                )}
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Pruebas Rápidas
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button variant="outlined" size="sm" fullWidth>
                  Probar Template de Bienvenida
                </Button>
                <Button variant="outlined" size="sm" fullWidth>
                  Probar Mensaje con Imagen
                </Button>
                <Button variant="outlined" size="sm" fullWidth>
                  Probar Mensaje con Botones
                </Button>
                <Button variant="outlined" size="sm" fullWidth>
                  Probar Ubicación
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
