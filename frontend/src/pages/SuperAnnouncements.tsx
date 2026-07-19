import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { PaperPlaneTilt } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import api from '../services/api'

interface Company {
  id: number
  name: string
}

/**
 * Comunicados (super): compone un anuncio in-app y lo envía a TODAS las empresas o a UNA específica
 * (POST /announcements/broadcast). Los usuarios lo ven en el AnnouncementBanner del layout.
 */
export default function SuperAnnouncements() {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [priority, setPriority] = useState('1')
  const [targetMode, setTargetMode] = useState<'all' | 'one'>('all')
  const [companyId, setCompanyId] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    api
      .get('/companies')
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data?.companies || data?.records || []
        setCompanies(list)
      })
      .catch(() => {
        /* silencioso */
      })
  }, [])

  const send = async () => {
    if (!title.trim() || !text.trim()) {
      toast.error('Título y mensaje son obligatorios')
      return
    }
    if (targetMode === 'one' && !companyId) {
      toast.error('Selecciona una empresa')
      return
    }
    setSending(true)
    try {
      const { data } = await api.post('/announcements/broadcast', {
        title: title.trim(),
        text: text.trim(),
        priority: Number(priority),
        target: targetMode === 'all' ? 'all' : Number(companyId),
      })
      toast.success(`Comunicado enviado a ${data?.created ?? 0} empresa(s)`)
      setTitle('')
      setText('')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error al enviar el comunicado')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-foreground">Comunicados</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Envía un comunicado in-app a todas las empresas o a una específica. Aparece como banner en el
        panel de los usuarios.
      </p>

      <div className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ann-title">Título</Label>
          <Input
            id="ann-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título del comunicado"
            maxLength={200}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ann-text">Mensaje</Label>
          <textarea
            id="ann-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Escribe el comunicado…"
            className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Prioridad</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Alta</SelectItem>
                <SelectItem value="2">Media</SelectItem>
                <SelectItem value="3">Baja</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Destinatario</Label>
            <Select value={targetMode} onValueChange={(v) => setTargetMode(v as 'all' | 'one')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las empresas</SelectItem>
                <SelectItem value="one">Una empresa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {targetMode === 'one' && (
          <div className="flex flex-col gap-1.5">
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={send} loading={sending}>
            <PaperPlaneTilt className="size-4" aria-hidden /> Enviar comunicado
          </Button>
        </div>
      </div>
    </div>
  )
}
