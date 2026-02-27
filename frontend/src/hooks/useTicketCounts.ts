/**
 * Hook: useTicketCounts
 * Gestiona los contadores de estados de tickets
 */

import { useState, useCallback, useEffect } from 'react'
import api from '../services/api'

export const useTicketCounts = (showAll: boolean) => {
  const [openCount, setOpenCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [closedCount, setClosedCount] = useState(0)
  const [groupCount, setGroupCount] = useState(0)

  /**
   * Obtiene contadores de tickets para cada estado
   * Ejecuta 4 peticiones en paralelo para mejor performance
   */
  const fetchTicketCounts = useCallback(async () => {
    try {
      const showAllParam = showAll ? 'true' : 'false'

      // Obtener contadores para cada estado en paralelo
      const [openRes, pendingRes, closedRes, groupRes] = await Promise.all([
        api.get('/tickets', { params: { status: 'open', showAll: showAllParam, pageNumber: 1 } }),
        api.get('/tickets', { params: { status: 'pending', showAll: showAllParam, pageNumber: 1 } }),
        api.get('/tickets', { params: { status: 'closed', showAll: showAllParam, pageNumber: 1 } }),
        api.get('/tickets', { params: { status: 'group', showAll: showAllParam, pageNumber: 1 } }),
      ])

      setOpenCount(openRes.data.count || 0)
      setPendingCount(pendingRes.data.count || 0)
      setClosedCount(closedRes.data.count || 0)
      setGroupCount(groupRes.data.count || 0)
    } catch (error) {
      console.error('Error fetching ticket counts:', error)
    }
  }, [showAll])

  // Auto-fetch cuando cambie showAll
  useEffect(() => {
    fetchTicketCounts()
  }, [fetchTicketCounts])

  return {
    openCount,
    pendingCount,
    closedCount,
    groupCount,
    setOpenCount,
    setPendingCount,
    setClosedCount,
    setGroupCount,
    fetchTicketCounts,
  }
}
