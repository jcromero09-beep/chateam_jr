import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Table, Sheet, Chip, CircularProgress, Alert, Button,
  Modal, ModalDialog, ModalClose, FormControl, FormLabel, Input,
  Select, Option, IconButton, Snackbar, Tooltip
} from '@mui/joy'
import { Link2, Plus, Copy, AlertCircle, ExternalLink } from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface AffLink {
  id: number
  slug: string
  targetUrl: string
  source: string
  medium: string
  clicks: number
  conversions: number
  status: string
  createdAt: string
  affiliate?: { id: number; name: string; referralCode: string }
}

// --- Modal Crear Link ---
function CreateLinkModal({ open, onClose, onSuccess, programs }: {
  open: boolean; onClose: () => void; onSuccess: () => void
  programs: Array<{ id: number; name: string }>
}) {
  const [programId, setProgramId] = useState<number | null>(null)
  const [targetUrl, setTargetUrl] = useState('')
  const [source, setSource] = useState('')
  const [medium, setMedium] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!programId) { setError('Selecciona un programa'); return }
    if (!targetUrl.trim()) { setError('La URL de destino es requerida'); return }
    setSaving(true)
    setError(null)
    try {
      await api.post('/affiliates/links', { programId, targetUrl, source, medium })
      onSuccess()
      onClose()
      setTargetUrl('')
      setSource('')
      setMedium('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear link'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxWidth: 480 }}>
        <ModalClose />
        <Typography level="title-lg">Crear Link de Afiliado</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          {error && <Alert color="danger" size="sm">{error}</Alert>}
          <FormControl required>
            <FormLabel>Programa</FormLabel>
            <Select value={programId} onChange={(_, v) => setProgramId(v)}>
              {programs.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
          </FormControl>
          <FormControl required>
            <FormLabel>URL de Destino</FormLabel>
            <Input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://tu-sitio.com/registro" />
          </FormControl>
          <FormControl>
            <FormLabel>Fuente (source)</FormLabel>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="facebook, google, email..." />
          </FormControl>
          <FormControl>
            <FormLabel>Medio (medium)</FormLabel>
            <Input value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="cpc, social, referral..." />
          </FormControl>
          <Button loading={saving} onClick={handleSubmit} sx={{ mt: 1 }}>Crear Link</Button>
        </Box>
      </ModalDialog>
    </Modal>
  )
}

export default function AffiliateLinks() {
  const [links, setLinks] = useState<AffLink[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [snackMsg, setSnackMsg] = useState<string | null>(null)
  const [programs, setPrograms] = useState<Array<{ id: number; name: string }>>([])

  const fetchLinks = useCallback(async () => {
    try {
      setLoading(true)
      const { data: res } = await api.get('/affiliates/links')
      if (res.success) {
        setLinks(res.data.rows || [])
        setCount(res.data.count || 0)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar'
      setError(msg)
      devLog('[AffiliateLinks] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPrograms = useCallback(async () => {
    try {
      const { data: res } = await api.get('/affiliates/programs', { params: { limit: 100 } })
      if (res.success) {
        setPrograms((res.data.rows || []).map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })))
      }
    } catch (err: unknown) {
      devLog('[AffiliateLinks] Programs error:', err)
    }
  }, [])

  useEffect(() => { fetchLinks(); fetchPrograms() }, [fetchLinks, fetchPrograms])

  const copyUrl = (slug: string) => {
    const fullUrl = `${window.location.origin}/ref/${slug}`
    navigator.clipboard.writeText(fullUrl)
    setSnackMsg('URL copiada al portapapeles')
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography level="h3" sx={{ fontWeight: 700 }}>
            <Link2 size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Links de Afiliado
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.500' }}>{count} links en total</Typography>
        </Box>
        <Button size="sm" startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
          Nuevo Link
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size="lg" /></Box>
      ) : error ? (
        <Alert color="danger" startDecorator={<AlertCircle size={18} />}>{error}</Alert>
      ) : links.length === 0 ? (
        <Alert color="neutral">Sin links de afiliado. Crea tu primer link.</Alert>
      ) : (
        <Sheet variant="outlined" sx={{ borderRadius: 'md', overflow: 'auto' }}>
          <Table stickyHeader hoverRow sx={{ '& th': { bgcolor: 'background.level1' } }}>
            <thead>
              <tr>
                <th>Slug</th>
                <th>Programa</th>
                <th>URL Destino</th>
                <th>Source / Medium</th>
                <th>Clicks</th>
                <th>Conversiones</th>
                <th>Estado</th>
                <th style={{ width: 100 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Typography level="body-sm" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      /ref/{l.slug}
                    </Typography>
                  </td>
                  <td><Typography level="body-sm">{l.affiliate?.name || '-'}</Typography></td>
                  <td>
                    <Typography level="body-xs" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.targetUrl}
                    </Typography>
                  </td>
                  <td>
                    <Typography level="body-xs">{l.source} / {l.medium}</Typography>
                  </td>
                  <td>
                    <Typography level="body-sm" sx={{ fontWeight: 600, color: '#3b82f6' }}>
                      {l.clicks.toLocaleString()}
                    </Typography>
                  </td>
                  <td>
                    <Typography level="body-sm" sx={{ fontWeight: 600, color: '#52b788' }}>
                      {l.conversions.toLocaleString()}
                    </Typography>
                  </td>
                  <td>
                    <Chip size="sm" variant="soft" color={l.status === 'active' ? 'success' : 'neutral'}>
                      {l.status === 'active' ? 'Activo' : 'Inactivo'}
                    </Chip>
                  </td>
                  <td>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Copiar URL">
                        <IconButton size="sm" variant="plain" onClick={() => copyUrl(l.slug)}>
                          <Copy size={14} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Abrir destino">
                        <IconButton size="sm" variant="plain" component="a" href={l.targetUrl} target="_blank">
                          <ExternalLink size={14} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Sheet>
      )}

      <CreateLinkModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchLinks}
        programs={programs}
      />

      <Snackbar open={!!snackMsg} autoHideDuration={3000} onClose={() => setSnackMsg(null)} color="success" variant="soft">
        {snackMsg}
      </Snackbar>
    </Box>
  )
}
