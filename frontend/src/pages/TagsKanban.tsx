import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'
// [conservado] CircularProgress no tiene equivalente en el design system
import { CircularProgress } from '@mui/joy'
import {
  MagnifyingGlass,
  PencilSimple,
  Trash,
  Plus,
  ArrowLeft,
  CaretLeft,
  CaretRight,
  Tag as TagIcon,
} from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

import api from '../services/api'
// @ts-ignore - TagModal es JS/JSX sin tipos
import TagModal from '../components/TagModal'

const PAGE_LIMIT = 10

interface Tag {
  id: number
  name: string
  color: string
  ticketTags?: unknown[]
}

const toastError = (err: any) => {
  const errorMsg = err?.response?.data?.message || err?.message || 'Ocurrió un error'
  toast.error(errorMsg)
}

const TagsKanban: React.FC = () => {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [count, setCount] = useState(0)
  const [tags, setTags] = useState<Tag[]>([])
  const [searchParam, setSearchParam] = useState('')

  const [selectedTag, setSelectedTag] = useState<Tag | null>(null)
  const [tagModalOpen, setTagModalOpen] = useState(false)
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null)

  const totalPages = Math.max(1, Math.ceil(count / PAGE_LIMIT))

  const fetchTags = useCallback(async (page: number, search: string) => {
    setLoading(true)
    try {
      const { data } = await api.get('/tags/', {
        params: { searchParam: search, pageNumber: page, kanban: 1 },
      })
      setTags(data.tags || [])
      setCount(data.count || 0)
    } catch (err) {
      toastError(err)
      setTags([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Búsqueda con debounce → reinicia a página 1
  useEffect(() => {
    const t = setTimeout(() => {
      setPageNumber(1)
      fetchTags(1, searchParam)
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParam])

  // Cambio de página
  useEffect(() => {
    fetchTags(pageNumber, searchParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber])

  const reload = () => fetchTags(pageNumber, searchParam)

  const handleOpenNew = () => {
    setSelectedTag(null)
    setTagModalOpen(true)
  }

  const handleEdit = (tag: Tag) => {
    setSelectedTag(tag)
    setTagModalOpen(true)
  }

  const handleCloseModal = () => {
    setSelectedTag(null)
    setTagModalOpen(false)
  }

  const handleSaved = () => {
    handleCloseModal()
    reload()
  }

  const handleDelete = async (tagId: number) => {
    try {
      await api.delete(`/tags/${tagId}`)
      toast.success('Etiqueta eliminada con éxito')
      // Si era el último de la página, retrocede una página
      if (tags.length === 1 && pageNumber > 1) {
        setPageNumber(p => p - 1)
      } else {
        reload()
      }
    } catch (err) {
      toastError(err)
    } finally {
      setDeletingTag(null)
    }
  }

  const goPrev = () => setPageNumber(p => Math.max(1, p - 1))
  const goNext = () => setPageNumber(p => Math.min(totalPages, p + 1))

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col bg-background p-4">
        {/* Cabecera */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-teal/10 text-brand-teal">
              <TagIcon className="size-5" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground">
                Etiquetas del Funnel
              </h1>
              <p className="text-sm text-muted-foreground">
                {count} etiqueta{count === 1 ? '' : 's'} en total
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px]">
              <MagnifyingGlass
                className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                placeholder="Buscar etiquetas…"
                aria-label="Buscar etiquetas"
                value={searchParam}
                onChange={e => setSearchParam(e.target.value.toLowerCase())}
                className="h-9 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>
            <Button size="sm" onClick={handleOpenNew}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Añadir etiqueta
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/funnel')}>
              <ArrowLeft className="size-4" aria-hidden />
              Volver al Funnel
            </Button>
          </div>
        </div>

        {/* Tabla */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-muted/60 text-left">
                  <th className="w-1/2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Etiqueta
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tickets
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!loading && tags.length === 0 && (
                  <tr>
                    <td colSpan={3}>
                      <div className="flex flex-col items-center justify-center gap-2 py-12">
                        <TagIcon className="size-9 text-muted-foreground" aria-hidden />
                        <p className="text-sm text-muted-foreground">
                          {searchParam ? 'Sin resultados para tu búsqueda' : 'Aún no hay etiquetas de funnel'}
                        </p>
                        {!searchParam && (
                          <Button size="sm" variant="outline" onClick={handleOpenNew}>
                            <Plus className="size-4" weight="bold" aria-hidden />
                            Crear la primera
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {tags.map(tag => (
                  <tr key={tag.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: tag.color }}
                          aria-hidden
                        />
                        {tag.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="neutral">{tag.ticketTags?.length ?? 0}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip title="Editar">
                          <button
                            type="button"
                            aria-label="Editar"
                            onClick={() => handleEdit(tag)}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </button>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <button
                            type="button"
                            aria-label="Eliminar"
                            onClick={() => setDeletingTag(tag)}
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}

                {loading && (
                  <tr>
                    <td colSpan={3}>
                      <div className="flex items-center justify-center py-8">
                        <CircularProgress size="sm" />
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <p className="text-sm text-muted-foreground">
              Página {pageNumber} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pageNumber <= 1 || loading}
                onClick={goPrev}
              >
                <CaretLeft className="size-4" aria-hidden />
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pageNumber >= totalPages || loading}
                onClick={goNext}
              >
                Siguiente
                <CaretRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>

        {/* Modal crear/editar */}
        {tagModalOpen && (
          <TagModal
            open={tagModalOpen}
            onClose={handleCloseModal}
            onSaved={handleSaved}
            aria-labelledby="form-dialog-title"
            tagId={selectedTag?.id}
            kanban={1}
          />
        )}

        {/* Confirmación de borrado */}
        <Dialog open={!!deletingTag} onOpenChange={open => { if (!open) setDeletingTag(null) }}>
          <DialogContent role="alertdialog" className="max-w-md">
            <DialogHeader>
              <DialogTitle>Eliminar etiqueta</DialogTitle>
              <DialogDescription>
                ¿Seguro que deseas eliminar la etiqueta <strong className="text-foreground">{deletingTag?.name}</strong>? Los tickets dejarán de estar en esta etapa del funnel.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDeletingTag(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                onClick={() => deletingTag && handleDelete(deletingTag.id)}
              >
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

export default TagsKanban
