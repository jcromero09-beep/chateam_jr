import { useEffect, useMemo, useState } from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Stack,
  FormControl,
  FormLabel,
  Select,
  Option,
  Button,
  Alert,
  Box,
  Chip,
} from '@mui/joy'

interface Queue {
  id: number
  name: string
  color?: string
}

interface AcceptTicketModalProps {
  open: boolean
  onClose: () => void
  queues: Queue[]
  ticketId: number | null
  contactName?: string
  submitting?: boolean
  errorMessage?: string | null
  onConfirm: (queueId: number) => Promise<void> | void
}

export default function AcceptTicketModal({
  open,
  onClose,
  queues,
  ticketId,
  contactName,
  submitting = false,
  errorMessage = null,
  onConfirm,
}: AcceptTicketModalProps) {
  const [selectedQueueId, setSelectedQueueId] = useState<number | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSelectedQueueId(null)
      setLocalError(null)
    }
  }, [open, ticketId])

  const sortedQueues = useMemo(
    () => [...queues].sort((a, b) => a.name.localeCompare(b.name)),
    [queues]
  )

  const handleConfirm = async () => {
    if (!selectedQueueId) {
      setLocalError('Selecciona una cola para continuar')
      return
    }
    setLocalError(null)
    await onConfirm(selectedQueueId)
  }

  const isEmpty = sortedQueues.length === 0

  return (
    <Modal open={open} onClose={() => (submitting ? undefined : onClose())}>
      <ModalDialog sx={{ minWidth: 380, maxWidth: 480 }}>
        <ModalClose disabled={submitting} />
        <Typography level="title-lg">Aceptar ticket</Typography>
        <Typography level="body-sm" sx={{ mt: 0.5, mb: 2 }}>
          {contactName
            ? `Selecciona la cola para asignar el ticket de ${contactName}.`
            : 'Selecciona la cola que atenderá este ticket.'}
        </Typography>

        <Stack spacing={2}>
          {isEmpty ? (
            <Alert color="warning" variant="soft">
              No hay colas disponibles. Crea una cola antes de aceptar este ticket.
            </Alert>
          ) : (
            <FormControl size="md" error={Boolean(localError)}>
              <FormLabel>Cola</FormLabel>
              <Select
                value={selectedQueueId !== null ? String(selectedQueueId) : ''}
                onChange={(_, value) =>
                  setSelectedQueueId(value ? Number(value) : null)
                }
                placeholder="Seleccionar cola"
                disabled={submitting}
              >
                {sortedQueues.map(queue => (
                  <Option key={queue.id} value={String(queue.id)}>
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                    >
                      {queue.color && (
                        <Chip
                          size="sm"
                          sx={{
                            bgcolor: queue.color,
                            color: 'white',
                            minWidth: 16,
                            minHeight: 16,
                            p: 0,
                          }}
                        >
                          {' '}
                        </Chip>
                      )}
                      <Typography level="body-sm">{queue.name}</Typography>
                    </Box>
                  </Option>
                ))}
              </Select>
            </FormControl>
          )}

          {(errorMessage || localError) && (
            <Alert color="danger" variant="soft">
              {errorMessage || localError}
            </Alert>
          )}

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              variant="plain"
              color="neutral"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              variant="solid"
              color="success"
              onClick={handleConfirm}
              loading={submitting}
              disabled={submitting || isEmpty}
            >
              Confirmar
            </Button>
          </Stack>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}
