import React from 'react'
import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  Divider,
  Stack,
  Button,
  Box,
} from '@mui/joy'
import WarningRoundedIcon from '@mui/icons-material/WarningRounded'

export type ConfirmColor = 'danger' | 'primary' | 'warning' | 'success' | 'neutral'

export interface ConfirmModalProps {
  open: boolean
  title: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  color?: ConfirmColor
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * Modal de confirmación reutilizable (MUI Joy) para reemplazar los
 * `window.confirm()` nativos del navegador por un diálogo con la estética de la
 * aplicación. Soporta estado de carga y color del botón de acción.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  color = 'primary',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={loading ? undefined : onClose}>
      <ModalDialog variant="outlined" role="alertdialog" sx={{ maxWidth: 420 }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: `${color}.500`,
            }}
          >
            <WarningRoundedIcon />
          </Box>
          {title}
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ py: 1 }}>{message}</DialogContent>
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
          <Button
            variant="plain"
            color="neutral"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant="solid"
            color={color}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </Stack>
      </ModalDialog>
    </Modal>
  )
}
