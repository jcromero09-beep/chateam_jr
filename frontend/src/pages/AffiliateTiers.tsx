import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress, Alert, Button,
  Modal, ModalDialog, ModalClose, FormControl, FormLabel, Input, Chip
} from '@mui/joy'
import { Layers, Plus, AlertCircle, Award, TrendingUp } from 'lucide-react'
import api from '../services/api'

const isDev = import.meta.env.DEV
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args) }

interface Tier {
  id: number
  name: string
  level: number
  commissionRate: number
  level2Rate: number
  level3Rate: number
  minReferrals: number
  minEarnings: number
  bonusRate: number
  status: string
}

// --- Modal Crear Tier ---
function CreateTierModal({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [level, setLevel] = useState(1)
  const [commissionRate, setCommissionRate] = useState(10)
  const [level2Rate, setLevel2Rate] = useState(5)
  const [level3Rate, setLevel3Rate] = useState(2)
  const [minReferrals, setMinReferrals] = useState(0)
  const [minEarnings, setMinEarnings] = useState(0)
  const [bonusRate, setBonusRate] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim()) { setError('El nombre es requerido'); return }
    setSaving(true)
    setError(null)
    try {
      await api.post('/affiliates/tiers', {
        name, level, commissionRate, level2Rate, level3Rate,
        minReferrals, minEarnings, bonusRate
      })
      onSuccess()
      onClose()
      setName('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear nivel'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxWidth: 500, maxHeight: '90vh', overflow: 'auto' }}>
        <ModalClose />
        <Typography level="title-lg">Crear Nivel MLM</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          {error && <Alert color="danger" size="sm">{error}</Alert>}
          <Grid container spacing={2}>
            <Grid xs={8}>
              <FormControl required>
                <FormLabel>Nombre</FormLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bronce, Plata, Oro..." />
              </FormControl>
            </Grid>
            <Grid xs={4}>
              <FormControl required>
                <FormLabel>Nivel</FormLabel>
                <Input type="number" value={level} onChange={(e) => setLevel(Number(e.target.value))} slotProps={{ input: { min: 1 } }} />
              </FormControl>
            </Grid>
          </Grid>
          <Typography level="title-sm" sx={{ mt: 1 }}>Comisiones por nivel</Typography>
          <Grid container spacing={2}>
            <Grid xs={4}>
              <FormControl required>
                <FormLabel>Nivel 1 (%)</FormLabel>
                <Input type="number" value={commissionRate} onChange={(e) => setCommissionRate(Number(e.target.value))} slotProps={{ input: { min: 0, max: 100, step: 0.5 } }} />
              </FormControl>
            </Grid>
            <Grid xs={4}>
              <FormControl>
                <FormLabel>Nivel 2 (%)</FormLabel>
                <Input type="number" value={level2Rate} onChange={(e) => setLevel2Rate(Number(e.target.value))} slotProps={{ input: { min: 0, max: 100, step: 0.5 } }} />
              </FormControl>
            </Grid>
            <Grid xs={4}>
              <FormControl>
                <FormLabel>Nivel 3 (%)</FormLabel>
                <Input type="number" value={level3Rate} onChange={(e) => setLevel3Rate(Number(e.target.value))} slotProps={{ input: { min: 0, max: 100, step: 0.5 } }} />
              </FormControl>
            </Grid>
          </Grid>
          <Typography level="title-sm" sx={{ mt: 1 }}>Requisitos minimos</Typography>
          <Grid container spacing={2}>
            <Grid xs={4}>
              <FormControl>
                <FormLabel>Min. Referidos</FormLabel>
                <Input type="number" value={minReferrals} onChange={(e) => setMinReferrals(Number(e.target.value))} slotProps={{ input: { min: 0 } }} />
              </FormControl>
            </Grid>
            <Grid xs={4}>
              <FormControl>
                <FormLabel>Min. Ganancias ($)</FormLabel>
                <Input type="number" value={minEarnings} onChange={(e) => setMinEarnings(Number(e.target.value))} slotProps={{ input: { min: 0 } }} />
              </FormControl>
            </Grid>
            <Grid xs={4}>
              <FormControl>
                <FormLabel>Bono (%)</FormLabel>
                <Input type="number" value={bonusRate} onChange={(e) => setBonusRate(Number(e.target.value))} slotProps={{ input: { min: 0, max: 100, step: 0.5 } }} />
              </FormControl>
            </Grid>
          </Grid>
          <Button loading={saving} onClick={handleSubmit} sx={{ mt: 1 }}>Crear Nivel</Button>
        </Box>
      </ModalDialog>
    </Modal>
  )
}

// --- Main Page ---
export default function AffiliateTiers() {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchTiers = useCallback(async () => {
    try {
      setLoading(true)
      const { data: res } = await api.get('/affiliates/tiers')
      if (res.success) {
        setTiers(res.data || [])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar'
      setError(msg)
      devLog('[AffiliateTiers] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTiers() }, [fetchTiers])

  const LEVEL_COLORS = ['#3b82f6', '#52b788', '#f3a43b', '#a855f7', '#ef4444']

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography level="h3" sx={{ fontWeight: 700 }}>
            <Layers size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Niveles MLM
          </Typography>
          <Typography level="body-sm" sx={{ color: 'neutral.500' }}>
            Estructura de comisiones escalonadas
          </Typography>
        </Box>
        <Button size="sm" startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
          Nuevo Nivel
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size="lg" /></Box>
      ) : error ? (
        <Alert color="danger" startDecorator={<AlertCircle size={18} />}>{error}</Alert>
      ) : tiers.length === 0 ? (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Typography level="body-lg" sx={{ mb: 1 }}>Sin niveles configurados</Typography>
            <Typography level="body-sm" sx={{ color: 'neutral.400', mb: 2 }}>
              Crea niveles MLM para comisiones escalonadas.
            </Typography>
            <Button size="sm" startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
              Crear Primer Nivel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {tiers.map((tier, idx) => {
            const color = LEVEL_COLORS[idx % LEVEL_COLORS.length]
            return (
              <Grid key={tier.id} xs={12} sm={6} md={4}>
                <Card variant="outlined" sx={{ height: '100%', borderLeft: `4px solid ${color}` }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Award size={20} style={{ color }} />
                        <Typography level="title-md" sx={{ fontWeight: 700 }}>{tier.name}</Typography>
                      </Box>
                      <Chip size="sm" variant="soft" color={tier.status === 'active' ? 'success' : 'neutral'}>
                        Nivel {tier.level}
                      </Chip>
                    </Box>

                    <Typography level="body-sm" sx={{ color: 'neutral.500', mb: 1.5 }}>Comisiones</Typography>
                    <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                      <Chip size="sm" variant="soft" color="primary" startDecorator={<TrendingUp size={12} />}>
                        N1: {tier.commissionRate}%
                      </Chip>
                      {tier.level2Rate > 0 && (
                        <Chip size="sm" variant="soft" color="success">N2: {tier.level2Rate}%</Chip>
                      )}
                      {tier.level3Rate > 0 && (
                        <Chip size="sm" variant="soft" color="warning">N3: {tier.level3Rate}%</Chip>
                      )}
                      {tier.bonusRate > 0 && (
                        <Chip size="sm" variant="outlined" color="success">Bono: {tier.bonusRate}%</Chip>
                      )}
                    </Box>

                    <Typography level="body-sm" sx={{ color: 'neutral.500', mb: 0.5 }}>Requisitos</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Typography level="body-xs">
                        Min. Referidos: <strong>{tier.minReferrals}</strong>
                      </Typography>
                      <Typography level="body-xs">
                        Min. Ganancias: <strong>${Number(tier.minEarnings || 0).toLocaleString()}</strong>
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}

      <CreateTierModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchTiers}
      />
    </Box>
  )
}
