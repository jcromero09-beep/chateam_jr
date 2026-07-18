import React from 'react'
import {
  Modal,
  ModalDialog,
  ModalClose,
  DialogContent,
} from '@mui/joy'
import CheckoutPage from '../CheckoutPage'

interface Invoice {
  id: number
  detail: string
  users: number
  connections: number
  queues: number
  value: number
  dueDate: string
  status: 'paid' | 'open' | 'proceso'
  subscriptionId?: string
  linkInvoice?: string
  planId?: number
  recurrence?: string
}

interface SubscriptionModalProps {
  open: boolean
  onClose: () => void
  invoice: Invoice | null
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  open,
  onClose,
  invoice
}) => {
  if (!invoice) return null

  const handleSuccess = () => {
    // Refresh page or close modal after successful payment
    setTimeout(() => {
      onClose()
    }, 2000)
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          minWidth: { xs: '95vw', md: 800 },
          maxWidth: '95vw',
          maxHeight: '95vh',
          overflow: 'auto',
          p: 3,
        }}
      >
        <ModalClose />
        <DialogContent sx={{ overflow: 'visible' }}>
          <CheckoutPage
            invoice={invoice}
            onClose={onClose}
            onSuccess={handleSuccess}
          />
        </DialogContent>
      </ModalDialog>
    </Modal>
  )
}

export default SubscriptionModal
