/**
 * Wrapper centralizado de notificaciones usando sonner.
 * Importar `toast` directamente desde 'sonner' o usar estos helpers.
 */
import { toast } from 'sonner'

export const showSuccess = (msg: string) => toast.success(msg)
export const showError = (msg: string) => toast.error(msg)
export const showInfo = (msg: string) => toast.info(msg)
export const showWarning = (msg: string) => toast.warning(msg)

export { toast }
export default toast
