/**
 * Hook: useFilterOptions
 * Obtiene las opciones para filtros (usuarios, colas, whatsapps)
 */

import { useState, useEffect } from 'react'
import api from '../services/api'

interface FilterOption {
  id: number
  name: string
}

export const useFilterOptions = () => {
  const [users, setUsers] = useState<FilterOption[]>([])
  const [queues, setQueues] = useState<FilterOption[]>([])
  const [whatsapps, setWhatsapps] = useState<FilterOption[]>([])

  /**
   * Obtiene usuarios, colas y conexiones WhatsApp para usar en filtros
   * Ejecuta las 3 peticiones en paralelo para mejor performance
   */
  const fetchFilterOptions = async () => {
    try {
      const [usersRes, queuesRes, whatsappsRes] = await Promise.all([
        api.get('/users'),
        api.get('/queues'),
        api.get('/whatsapps')
      ])

      setUsers(usersRes.data.users || usersRes.data || [])
      setQueues(queuesRes.data.queues || queuesRes.data || [])
      setWhatsapps(whatsappsRes.data.whatsapps || whatsappsRes.data || [])
    } catch (error) {
      console.error('Error fetching filter options:', error)
    }
  }

  useEffect(() => {
    fetchFilterOptions()
  }, [])

  return {
    users,
    queues,
    whatsapps,
    fetchFilterOptions,
  }
}
