import { toast } from 'sonner'

interface ErrorWithResponse {
  response?: {
    data?: {
      error?: string
    }
  }
  message?: string
}

const toastError = (err: ErrorWithResponse) => {
  const errorMsg = err.response?.data?.error || err.message || 'Ocurrió un error'
  if (errorMsg) {
    toast.error(errorMsg)
  }
}

export default toastError
