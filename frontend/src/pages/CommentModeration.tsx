import { useState, useEffect, useCallback } from 'react'
import { ArrowClockwise, CheckCircle, XCircle, ShieldWarning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/stat-tile'
import { cn } from '@/lib/utils'
import api from '../services/api'
import { showError, showSuccess } from '../utils/showToast'

type Comment = {
  id: number
  content: string
  sensitiveCategory?: string
  moderationStatus?: string
  moderationDraft?: string
  authorName?: string
}

const CAT_LABEL: Record<string, string> = {
  insultos: 'Insultos / ofensas',
  legal_electoral: 'Legal / electoral',
  otros_candidatos: 'Otros candidatos',
  denuncias: 'Denuncias graves',
  spam: 'Spam / enlaces',
  amenazas: 'Amenazas',
}

const CommentModeration = () => {
  const [comments, setComments] = useState<Comment[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [filter, setFilter] = useState<string>('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/moderation/queue', { params: filter ? { category: filter } : {} })
      setComments(res.data.comments || [])
      setCount(res.data.count || 0)
      const d: Record<number, string> = {}
      for (const c of res.data.comments || []) d[c.id] = c.moderationDraft || ''
      setDrafts(d)
    } catch {
      showError('No se pudo cargar la cola de moderación')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const act = async (id: number, action: 'approve' | 'reject' | 'edit_draft') => {
    try {
      await api.post(`/moderation/${id}/act`, { action, draft: drafts[id] })
      if (action !== 'edit_draft') {
        showSuccess(action === 'approve' ? 'Aprobado' : 'Rechazado')
        setComments((prev) => prev.filter((c) => c.id !== id))
        setCount((c) => Math.max(0, c - 1))
      } else {
        showSuccess('Borrador guardado')
      }
    } catch {
      showError('No se pudo procesar')
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <ShieldWarning className="size-6 text-warning-text" weight="fill" />
            Moderación de comentarios
          </h1>
          <p className="text-sm text-muted-foreground">
            Los comentarios sensibles esperan aprobación humana. Nunca se publican solos.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <ArrowClockwise className={cn('size-4', loading && 'animate-spin')} /> Actualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="En cola de revisión" value={String(count)} tone={count > 0 ? 'warning' : 'success'} />
        <StatTile label="Filtrando" value={filter ? (CAT_LABEL[filter] || filter) : 'Todas'} />
        <StatTile label="Regla" value="Cero auto-publicación" tone="primary" />
      </div>

      <div className="flex flex-wrap gap-1">
        {['', 'insultos', 'legal_electoral', 'denuncias', 'spam', 'otros_candidatos'].map((k) => (
          <button
            key={k || 'all'}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              filter === k ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {k ? (CAT_LABEL[k] || k) : 'Todas'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : comments.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <CheckCircle className="mx-auto size-8 text-success-text" weight="fill" />
          <p className="mt-2 text-sm text-muted-foreground">No hay comentarios pendientes de revisión.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning" dot>{CAT_LABEL[c.sensitiveCategory || ''] || c.sensitiveCategory}</Badge>
                {c.authorName && <span className="text-xs text-muted-foreground">{c.authorName}</span>}
              </div>
              <p className="mt-2 rounded-md bg-muted/50 p-2 text-sm text-foreground">{c.content}</p>
              <label className="mt-3 block text-xs font-medium text-muted-foreground">
                Borrador de respuesta (edítalo antes de aprobar)
              </label>
              <textarea
                value={drafts[c.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                onBlur={() => act(c.id, 'edit_draft')}
                rows={2}
                className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Escribe o edita la respuesta…"
              />
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => act(c.id, 'approve')}>
                  <CheckCircle className="size-4" /> Aprobar y responder
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act(c.id, 'reject')}>
                  <XCircle className="size-4" /> Rechazar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CommentModeration
