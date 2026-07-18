import React, { useMemo, useCallback } from 'react'
import {
  Box, Input, IconButton, Typography, Stack, Chip
} from '@mui/joy'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'

interface ConversationSearchBarProps {
  messages: Array<{ id: number; body: string }>
  searchTerm: string
  onSearchTermChange: (term: string) => void
  isDark: boolean
}

export default function ConversationSearchBar({
  messages,
  searchTerm,
  onSearchTermChange,
  isDark,
}: ConversationSearchBarProps) {
  const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0)

  // Índices de mensajes que coinciden con el término
  const matchingIndices = useMemo(() => {
    if (!searchTerm.trim()) return []
    const term = searchTerm.toLowerCase()
    return messages
      .map((m, i) => (m.body?.toLowerCase().includes(term) ? i : -1))
      .filter((i) => i !== -1)
  }, [messages, searchTerm])

  const totalMatches = matchingIndices.length
  const hasMatches = totalMatches > 0

  const scrollToMatch = useCallback(
    (direction: 'up' | 'down') => {
      if (!hasMatches) return

      let next = direction === 'down'
        ? (currentMatchIndex + 1) % totalMatches
        : (currentMatchIndex - 1 + totalMatches) % totalMatches

      setCurrentMatchIndex(next)
      const msgIndex = matchingIndices[next]
      const el = document.getElementById(`msg-${messages[msgIndex]?.id}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Highlight flash
        el.style.outline = '2px solid #FFC107'
        setTimeout(() => {
          el.style.outline = ''
        }, 1000)
      }
    },
    [hasMatches, currentMatchIndex, totalMatches, matchingIndices, messages]
  )

  const handleClear = () => {
    onSearchTermChange('')
    setCurrentMatchIndex(0)
  }

  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        borderBottom: `1px solid ${isDark ? '#3A3B3C' : '#DADDE1'}`,
        bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.95)',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <SearchIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        <Input
          size="sm"
          placeholder="Buscar en esta conversación..."
          value={searchTerm}
          onChange={(e) => {
            onSearchTermChange(e.target.value)
            setCurrentMatchIndex(0)
          }}
          sx={{ flex: 1 }}
          slotProps={{
            input: {
              'data-testid': 'conversation-search-input',
            },
          }}
        />

        {hasMatches && (
          <Chip size="sm" variant="soft" sx={{ flexShrink: 0 }}>
            {currentMatchIndex + 1}/{totalMatches}
          </Chip>
        )}

        {hasMatches && (
          <IconButton size="sm" onClick={() => scrollToMatch('up')} sx={{ flexShrink: 0 }}>
            <ArrowUpwardIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
        {hasMatches && (
          <IconButton size="sm" onClick={() => scrollToMatch('down')} sx={{ flexShrink: 0 }}>
            <ArrowDownwardIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}

        <IconButton size="sm" onClick={handleClear} sx={{ flexShrink: 0 }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>
    </Box>
  )
}
