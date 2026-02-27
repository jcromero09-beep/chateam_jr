/**
 * Hook: useTicketFilters
 * Gestiona todo el estado de filtros para tickets
 */

import { useState } from 'react'

export const useTicketFilters = () => {
  // Estado de filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [showAll, setShowAll] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [whatsappFilter, setWhatsappFilter] = useState<string>('')
  const [userFilter, setUserFilter] = useState<string>('')
  const [queueFilter, setQueueFilter] = useState<string>('')
  const [searchMessages, setSearchMessages] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  return {
    // Search term
    searchTerm,
    setSearchTerm,

    // Status filter
    statusFilter,
    setStatusFilter,

    // Show all tickets
    showAll,
    setShowAll,

    // Date range
    startDate,
    setStartDate,
    endDate,
    setEndDate,

    // Filters
    whatsappFilter,
    setWhatsappFilter,
    userFilter,
    setUserFilter,
    queueFilter,
    setQueueFilter,

    // Search in messages
    searchMessages,
    setSearchMessages,

    // Show/hide filters panel
    showFilters,
    setShowFilters,
  }
}
