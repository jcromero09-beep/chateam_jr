import { useState } from 'react'
import {
  PaperPlaneTilt,
  Flask,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  FileText,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

interface TestResult {
  id: number
  timestamp: string
  type: string
  status: 'success' | 'error'
  response: string
  duration: number
}

const inputClass =
  'h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

const textareaClass =
  'w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'

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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <Flask className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Herramienta de Testing WhatsApp
            </h1>
            <p className="text-sm text-muted-foreground">
              Prueba el envío de mensajes y templates de WhatsApp Business API
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Configurar mensaje */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Configurar Mensaje de Prueba
            </h2>

            <div className="mb-4 space-y-1.5">
              <Label htmlFor="wa-phone">Número de Teléfono Destino</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  +52
                </span>
                <input
                  id="wa-phone"
                  className={`${inputClass} pl-11`}
                  placeholder="+1 555-0000"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Incluye el código de país (ej: +52 para México)
              </p>
            </div>

            <div className="mb-4 space-y-1.5">
              <Label htmlFor="wa-type">Tipo de Mensaje</Label>
              <Select value={messageType} onValueChange={(val) => setMessageType(val)}>
                <SelectTrigger id="wa-type" className="h-11">
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto Simple</SelectItem>
                  <SelectItem value="template">Template Aprobado</SelectItem>
                  <SelectItem value="image">Imagen</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                  <SelectItem value="location">Ubicación</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {messageType === 'text' && (
              <div className="mb-4 space-y-1.5">
                <Label htmlFor="wa-content">Contenido del Mensaje</Label>
                <textarea
                  id="wa-content"
                  rows={3}
                  className={textareaClass}
                  placeholder="Escribe tu mensaje de prueba aquí..."
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                />
              </div>
            )}

            {messageType === 'template' && (
              <>
                <div className="mb-4 space-y-1.5">
                  <Label htmlFor="wa-template">Seleccionar Template</Label>
                  <Select value={templateName} onValueChange={(val) => setTemplateName(val)}>
                    <SelectTrigger id="wa-template" className="h-11">
                      <SelectValue placeholder="Selecciona un template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bienvenida_cliente">bienvenida_cliente</SelectItem>
                      <SelectItem value="confirmacion_pedido">confirmacion_pedido</SelectItem>
                      <SelectItem value="codigo_verificacion">codigo_verificacion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="mb-4 space-y-1.5">
                  <Label htmlFor="wa-vars">Variables (JSON)</Label>
                  <textarea
                    id="wa-vars"
                    rows={2}
                    className={textareaClass}
                    placeholder='{"1": "Juan", "2": "JR Chateam"}'
                    defaultValue='{"1": "Cliente", "2": "JR Chateam"}'
                  />
                </div>
              </>
            )}

            {messageType === 'image' && (
              <div className="mb-4 space-y-1.5">
                <Label htmlFor="wa-image">URL de la Imagen</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <ImageIcon className="size-[18px]" aria-hidden />
                  </span>
                  <input
                    id="wa-image"
                    className={`${inputClass} pl-11`}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
              </div>
            )}

            {messageType === 'document' && (
              <div className="mb-4 space-y-1.5">
                <Label htmlFor="wa-doc">URL del Documento</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <FileText className="size-[18px]" aria-hidden />
                  </span>
                  <input
                    id="wa-doc"
                    className={`${inputClass} pl-11`}
                    placeholder="https://example.com/document.pdf"
                  />
                </div>
              </div>
            )}

            {messageType === 'location' && (
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wa-lat">Latitud</Label>
                  <input id="wa-lat" className={inputClass} placeholder="19.432608" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-lng">Longitud</Label>
                  <input id="wa-lng" className={inputClass} placeholder="-99.133209" />
                </div>
              </div>
            )}

            <div
              role="alert"
              className="mb-4 rounded-md border border-warning/40 bg-warning/16 px-3.5 py-3 text-sm text-warning-text"
            >
              El mensaje de prueba se enviará utilizando la API de WhatsApp Cloud API v20+
            </div>

            <Button
              size="lg"
              className="w-full"
              loading={loading}
              onClick={handleSendTest}
              disabled={!phoneNumber || (messageType === 'text' && !messageContent)}
            >
              <PaperPlaneTilt className="size-5" weight="fill" aria-hidden />
              Enviar Mensaje de Prueba
            </Button>
          </div>

          {/* Resultados */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Resultados de Pruebas
              </h2>

              <div className="flex flex-col gap-4">
                {testResults.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No hay resultados de pruebas aún. Envía un mensaje para comenzar.
                    </p>
                  </div>
                ) : (
                  testResults.map((result) => (
                    <div
                      key={result.id}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={result.status === 'success' ? 'success' : 'destructive'}
                          >
                            {result.status === 'success' ? (
                              <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                            ) : (
                              <XCircle className="size-3.5" weight="fill" aria-hidden />
                            )}
                            {result.status}
                          </Badge>
                          <Badge variant="outline">{result.type}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {result.duration}ms
                        </span>
                      </div>

                      <p className="mb-3 text-xs text-muted-foreground">{result.timestamp}</p>

                      <div>
                        <p className="mb-1 text-sm font-semibold text-foreground">
                          Respuesta de la API:
                        </p>
                        <div className="overflow-auto rounded-sm border border-border bg-muted p-2 font-mono text-xs text-foreground">
                          <pre className="m-0">{result.response}</pre>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pruebas rápidas */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
              <h2 className="mb-4 text-base font-semibold text-foreground">Pruebas Rápidas</h2>

              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" className="w-full">
                  Probar Template de Bienvenida
                </Button>
                <Button variant="outline" size="sm" className="w-full">
                  Probar Mensaje con Imagen
                </Button>
                <Button variant="outline" size="sm" className="w-full">
                  Probar Mensaje con Botones
                </Button>
                <Button variant="outline" size="sm" className="w-full">
                  Probar Ubicación
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
