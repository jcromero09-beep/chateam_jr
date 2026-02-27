/**
 * Hook: useMessageFormatting
 * Gestiona el formateo de fechas y horas para mensajes
 * Estilo WhatsApp Web - soporte completo de separadores de fecha
 */

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']

export const useMessageFormatting = () => {

  const startOfDay = (d: Date): Date => {
    const copy = new Date(d)
    copy.setHours(0, 0, 0, 0)
    return copy
  }

  const daysDiff = (msgDate: Date, now: Date): number => {
    const msPerDay = 86400000
    return Math.floor((startOfDay(now).getTime() - startOfDay(msgDate).getTime()) / msPerDay)
  }

  /**
   * Formatea hora en formato HH:mm (24h)
   */
  const formatTime = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }

  /**
   * Separador de fecha entre grupos de mensajes (estilo WhatsApp Web)
   * "HOY" | "AYER" | "LUNES" | "15/01/2025"
   */
  const formatDateSeparator = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = daysDiff(date, now)

    if (diff === 0) return 'HOY'
    if (diff === 1) return 'AYER'
    if (diff < 7) return DAY_NAMES[date.getDay()].toUpperCase()

    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  /**
   * Timestamp para sidebar de tickets (estilo WhatsApp)
   * Hoy: "14:30" | Ayer: "Ayer" | Esta semana: "Lunes" | Mas antiguo: "15/01/2025"
   */
  const formatTicketDate = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = daysDiff(date, now)

    if (diff === 0) return formatTime(dateString)
    if (diff === 1) return 'Ayer'
    if (diff < 7) return DAY_NAMES[date.getDay()]

    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  /**
   * Formatea una fecha adaptando el formato segun antiguedad (calendario)
   * Backward compatible con la version anterior
   */
  const formatDate = (dateString: string): string => {
    return formatTicketDate(dateString)
  }

  /**
   * Determina si se debe mostrar separador de fecha antes de este mensaje
   */
  const shouldShowDateSeparator = (
    currentMsg: { createdAt: string },
    prevMsg: { createdAt: string } | null
  ): boolean => {
    if (!prevMsg) return true
    const currentDay = startOfDay(new Date(currentMsg.createdAt)).getTime()
    const prevDay = startOfDay(new Date(prevMsg.createdAt)).getTime()
    return currentDay !== prevDay
  }

  return {
    formatTime,
    formatDate,
    formatDateSeparator,
    formatTicketDate,
    shouldShowDateSeparator,
  }
}
