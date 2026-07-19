import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import api from '../services/api'

interface Announcement {
  id: number
  title: string
  text: string
  priority: number
}

const DISMISS_KEY = 'dismissed_announcements'

const getDismissed = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')
  } catch {
    return []
  }
}

// prioridad: 1=alta, 2=media, 3=baja
const priorityTone: Record<number, string> = {
  1: 'border-destructive/40 bg-destructive/10',
  2: 'border-warning/40 bg-warning/10',
  3: 'border-primary/40 bg-primary/10',
}

/**
 * Banner de comunicados in-app. Consume GET /announcements (ya acotado por companyId en el backend)
 * y muestra los anuncios activos de la empresa del usuario, descartables (persistido en localStorage).
 * Alimentado por el broadcast del super (POST /announcements/broadcast) o por announcements per-empresa.
 */
export default function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([])
  const [dismissed, setDismissed] = useState<number[]>(getDismissed())

  useEffect(() => {
    let active = true
    api
      .get('/announcements', { params: { pageNumber: 1 } })
      .then(({ data }) => {
        if (active) setItems(data?.records || [])
      })
      .catch(() => {
        /* silencioso: un banner que falla no debe romper el layout */
      })
    return () => {
      active = false
    }
  }, [])

  const dismiss = (id: number) => {
    const next = Array.from(new Set([...dismissed, id]))
    setDismissed(next)
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next))
  }

  const visible = items.filter((a) => !dismissed.includes(a.id))
  if (visible.length === 0) return null

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {visible.map((a) => (
        <div
          key={a.id}
          role="status"
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm text-foreground ${
            priorityTone[a.priority] || priorityTone[3]
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{a.title}</p>
            <p className="mt-0.5 whitespace-pre-line text-foreground/80">{a.text}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(a.id)}
            aria-label="Descartar comunicado"
            className="shrink-0 rounded p-1 text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
