/**
 * Hook: useChannelUtils
 * Gestiona iconos y colores de los diferentes canales de comunicación
 */

import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import TelegramIcon from '@mui/icons-material/Telegram'
import FacebookIcon from '@mui/icons-material/Facebook'
import InstagramIcon from '@mui/icons-material/Instagram'

export const useChannelUtils = () => {
  /**
   * Obtiene el icono correspondiente al canal
   * @param channel - Nombre del canal ('whatsapp', 'telegram', 'facebook', 'instagram')
   * @returns Icono del canal con el color correspondiente
   */
  const getChannelIcon = (channel?: string) => {
    switch (channel) {
      case 'whatsapp':
        return <WhatsAppIcon sx={{ fontSize: 14, color: '#25D366' }} />
      case 'telegram':
        return <TelegramIcon sx={{ fontSize: 14, color: '#0088cc' }} />
      case 'facebook':
        return <FacebookIcon sx={{ fontSize: 14, color: '#4267B2' }} />
      case 'instagram':
        return <InstagramIcon sx={{ fontSize: 14, color: '#E1306C' }} />
      default:
        return <WhatsAppIcon sx={{ fontSize: 14, color: '#25D366' }} />
    }
  }

  /**
   * Obtiene el color hexadecimal correspondiente al canal
   * @param channel - Nombre del canal ('whatsapp', 'telegram', 'facebook', 'instagram')
   * @returns Color hexadecimal del canal
   */
  const getChannelColor = (channel?: string) => {
    switch (channel) {
      case 'whatsapp':
        return '#25D366'
      case 'telegram':
        return '#0088cc'
      case 'facebook':
        return '#4267B2'
      case 'instagram':
        return '#E1306C'
      default:
        return '#25D366'
    }
  }

  return {
    getChannelIcon,
    getChannelColor,
  }
}
