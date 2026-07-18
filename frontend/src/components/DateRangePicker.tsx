import { useState, useRef, useEffect } from 'react'
import { Box, Typography, Button, IconButton, Sheet, Divider, Stack } from '@mui/joy'
import {
  CalendarMonth as CalendarIcon,
  KeyboardArrowLeft as ArrowLeftIcon,
  KeyboardArrowRight as ArrowRightIcon,
  ArrowDropDown as DropdownIcon,
} from '@mui/icons-material'

// Date presets matching Meta Ads Manager
const DATE_PRESETS = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: 'last_7_days', label: 'Ultimos 7 dias' },
  { key: 'last_14_days', label: 'Ultimos 14 dias' },
  { key: 'last_28_days', label: 'Ultimos 28 dias' },
  { key: 'last_30_days', label: 'Ultimos 30 dias' },
  { key: 'this_week', label: 'Esta semana' },
  { key: 'last_week', label: 'La semana pasada' },
  { key: 'this_month', label: 'Este mes' },
  { key: 'last_month', label: 'El mes pasado' },
  { key: 'maximum', label: 'Maximo' },
]

// Helper: compute dates for a preset
function getPresetDates(key: string): { since: string; until: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  let since: Date
  let until: Date = today

  switch (key) {
    case 'today':
      since = today
      break

    case 'yesterday':
      since = new Date(today)
      since.setDate(since.getDate() - 1)
      until = new Date(since)
      break

    case 'last_7_days':
      since = new Date(today)
      since.setDate(since.getDate() - 6)
      break

    case 'last_14_days':
      since = new Date(today)
      since.setDate(since.getDate() - 13)
      break

    case 'last_28_days':
      since = new Date(today)
      since.setDate(since.getDate() - 27)
      break

    case 'last_30_days':
      since = new Date(today)
      since.setDate(since.getDate() - 29)
      break

    case 'this_week':
      // Week starts on Monday
      since = new Date(today)
      const dayOfWeek = since.getDay()
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      since.setDate(since.getDate() - diff)
      break

    case 'last_week':
      // Previous week Monday to Sunday
      since = new Date(today)
      const currentDay = since.getDay()
      const daysToMonday = currentDay === 0 ? 6 : currentDay - 1
      since.setDate(since.getDate() - daysToMonday - 7)
      until = new Date(since)
      until.setDate(until.getDate() + 6)
      break

    case 'this_month':
      since = new Date(today.getFullYear(), today.getMonth(), 1)
      break

    case 'last_month':
      since = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      until = new Date(today.getFullYear(), today.getMonth(), 0)
      break

    case 'maximum':
      // 90 days back
      since = new Date(today)
      since.setDate(since.getDate() - 89)
      break

    default:
      since = today
  }

  return {
    since: formatDate(since),
    until: formatDate(until),
  }
}

// Helper: format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Helper: format date as DD MMM YYYY (defensivo ante fechas vacías)
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return ''
  const monthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const [year, month, day] = dateStr.split('-')
  return `${day} ${monthsShort[parseInt(month) - 1]} ${year}`
}

// Helper: get days in month grid (including padding from prev/next months)
function getCalendarDays(year: number, month: number): { date: Date; isCurrentMonth: boolean }[] {
  const firstDay = new Date(year, month, 1)

  // Get day of week for first day (0 = Sunday, 1 = Monday, etc.)
  let firstDayOfWeek = firstDay.getDay()
  // Convert to Monday = 0, Sunday = 6
  firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

  // Start from the Monday of the first week
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - firstDayOfWeek)

  const days: { date: Date; isCurrentMonth: boolean }[] = []

  // Generate 42 days (6 weeks)
  for (let i = 0; i < 42; i++) {
    const currentDate = new Date(startDate)
    currentDate.setDate(startDate.getDate() + i)
    days.push({
      date: currentDate,
      isCurrentMonth: currentDate.getMonth() === month,
    })
  }

  return days
}

interface DateRangePickerProps {
  since: string
  until: string
  presetLabel: string
  onApply: (since: string, until: string, presetLabel: string) => void
  /** Nº de meses visibles en el calendario (default 2). */
  months?: 1 | 2
  /** Mostrar la barra lateral de presets (default true). */
  showPresets?: boolean
  /** Alineación horizontal del desplegable respecto al trigger (default 'right'). */
  align?: 'left' | 'right'
  /** Mostrar botón "Limpiar" que quita el filtro (onApply con fechas vacías) (default false). */
  allowClear?: boolean
  /** Mostrar el rango de fechas en el botón en vez del presetLabel (default false). */
  showRangeInTrigger?: boolean
  /** Texto del botón cuando no hay rango seleccionado (default 'Fechas'). */
  placeholder?: string
  /** El trigger ocupa el ancho completo del contenedor (default false). */
  fullWidth?: boolean
}

export default function DateRangePicker({
  since,
  until,
  presetLabel,
  onApply,
  months = 2,
  showPresets = true,
  align = 'right',
  allowClear = false,
  showRangeInTrigger = false,
  placeholder = 'Fechas',
  fullWidth = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [tempSince, setTempSince] = useState(since)
  const [tempUntil, setTempUntil] = useState(until)
  const [tempLabel, setTempLabel] = useState(presetLabel)
  const [selectingEnd, setSelectingEnd] = useState(false)
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  // Calendar navigation - show two months
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth()) // 0-indexed

  const containerRef = useRef<HTMLDivElement>(null)

  // Click outside handler
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Sync temp state when props change
  useEffect(() => {
    if (!open) {
      setTempSince(since)
      setTempUntil(until)
      setTempLabel(presetLabel)
    }
  }, [since, until, presetLabel, open])

  // Al abrir, posicionar el calendario en el mes de la fecha inicial (si existe)
  useEffect(() => {
    if (open && since) {
      const [y, m] = since.split('-')
      if (y && m) {
        setViewYear(parseInt(y))
        setViewMonth(parseInt(m) - 1)
      }
    }
  }, [open, since])

  // Handle preset click - apply immediately
  const handlePresetClick = (preset: typeof DATE_PRESETS[number]) => {
    const dates = getPresetDates(preset.key)
    onApply(dates.since, dates.until, preset.label)
    setOpen(false)
  }

  // Handle day click on calendar
  const handleDayClick = (dateStr: string) => {
    if (!selectingEnd) {
      setTempSince(dateStr)
      setTempUntil(dateStr)
      setSelectingEnd(true)
      setTempLabel('Personalizado')
    } else {
      if (dateStr < tempSince) {
        setTempSince(dateStr)
        setTempUntil(tempSince)
      } else {
        setTempUntil(dateStr)
      }
      setSelectingEnd(false)
    }
  }

  // Navigate months
  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  // Apply custom selection
  const handleApply = () => {
    onApply(tempSince, tempUntil, tempLabel)
    setOpen(false)
    setSelectingEnd(false)
  }

  // Cancel and reset
  const handleCancel = () => {
    setTempSince(since)
    setTempUntil(until)
    setTempLabel(presetLabel)
    setSelectingEnd(false)
    setOpen(false)
  }

  // Clear filter (fechas vacías)
  const handleClear = () => {
    setTempSince('')
    setTempUntil('')
    setTempLabel(placeholder)
    setSelectingEnd(false)
    onApply('', '', placeholder)
    setOpen(false)
  }

  // Render a single month calendar
  const renderMonth = (year: number, month: number) => {
    const days = getCalendarDays(year, month)
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    const dayHeaders = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

    return (
      <Box sx={{ width: 260 }}>
        <Typography level="title-sm" sx={{ textAlign: 'center', mb: 1.5, fontWeight: 600 }}>
          {monthNames[month]} {year}
        </Typography>
        {/* Day headers */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, mb: 0.5 }}>
          {dayHeaders.map((d, i) => (
            <Typography key={i} level="body-xs" sx={{ textAlign: 'center', color: 'text.tertiary', py: 0.5, fontWeight: 600 }}>
              {d}
            </Typography>
          ))}
        </Box>
        {/* Day cells */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0 }}>
          {days.map((day, i) => {
            const dateStr = formatDate(day.date)
            const hasSelection = Boolean(tempSince && tempUntil)
            const isStart = hasSelection && dateStr === tempSince
            const isEnd = hasSelection && dateStr === tempUntil
            const isInRange = hasSelection && dateStr > tempSince && dateStr < tempUntil
            const isSingleDay = hasSelection && tempSince === tempUntil && dateStr === tempSince

            // Hover range calculation when selecting end date
            let isHoverRange = false
            if (selectingEnd && hoverDate && day.isCurrentMonth) {
              if (hoverDate >= tempSince) {
                isHoverRange = dateStr > tempSince && dateStr <= hoverDate
              } else {
                isHoverRange = dateStr >= hoverDate && dateStr < tempSince
              }
            }

            const isToday = dateStr === formatDate(new Date())

            // Determine background color and border radius
            let bgcolor = 'transparent'
            let borderRadius: string | number = 0
            let textColor = day.isCurrentMonth ? 'text.primary' : 'text.tertiary'

            if (isSingleDay) {
              bgcolor = 'primary.500'
              borderRadius = '50%'
              textColor = 'white'
            } else if (isStart && isEnd) {
              bgcolor = 'primary.500'
              borderRadius = '50%'
              textColor = 'white'
            } else if (isStart) {
              bgcolor = 'primary.500'
              borderRadius = '50% 0 0 50%'
              textColor = 'white'
            } else if (isEnd) {
              bgcolor = 'primary.500'
              borderRadius = '0 50% 50% 0'
              textColor = 'white'
            } else if (isInRange || isHoverRange) {
              bgcolor = 'primary.100'
              borderRadius = 0
            }

            return (
              <Box
                key={i}
                onClick={() => day.isCurrentMonth && handleDayClick(dateStr)}
                onMouseEnter={() => setHoverDate(dateStr)}
                sx={{
                  textAlign: 'center',
                  py: 0.5,
                  cursor: day.isCurrentMonth ? 'pointer' : 'default',
                  opacity: day.isCurrentMonth ? 1 : 0.4,
                  bgcolor,
                  borderRadius,
                  position: 'relative',
                  '&:hover': day.isCurrentMonth ? {
                    bgcolor: (isStart || isEnd || isSingleDay) ? 'primary.600' : bgcolor === 'transparent' ? 'neutral.100' : bgcolor,
                  } : {},
                }}
              >
                <Typography
                  level="body-sm"
                  sx={{
                    color: textColor,
                    fontWeight: isToday ? 'bold' : 'normal',
                    textDecoration: isToday && !isStart && !isEnd && !isSingleDay ? 'underline' : 'none',
                  }}
                >
                  {day.date.getDate()}
                </Typography>
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  }

  // Second month
  const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1
  const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear

  // Texto del botón trigger
  const hasRange = Boolean(since && until)
  const triggerText = showRangeInTrigger
    ? (hasRange ? `${formatDisplayDate(since)} — ${formatDisplayDate(until)}` : placeholder)
    : presetLabel

  return (
    <Box
      ref={containerRef}
      sx={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : undefined }}
    >
      {/* Trigger Button */}
      <Button
        variant="outlined"
        color="neutral"
        startDecorator={<CalendarIcon sx={{ fontSize: 18 }} />}
        endDecorator={<DropdownIcon />}
        onClick={() => setOpen(!open)}
        size="sm"
        sx={{ minWidth: fullWidth ? 0 : 200, width: fullWidth ? '100%' : undefined, justifyContent: 'space-between' }}
      >
        {triggerText}
      </Button>

      {/* Dropdown */}
      {open && (
        <Sheet
          variant="outlined"
          sx={{
            position: 'absolute',
            top: '100%',
            ...(align === 'left' ? { left: 0 } : { right: 0 }),
            mt: 0.5,
            zIndex: 1300,
            borderRadius: 'md',
            boxShadow: 'lg',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.surface',
          }}
        >
          <Box sx={{ display: 'flex' }}>
            {/* Presets sidebar */}
            {showPresets && (
              <Box sx={{ width: 180, borderRight: '1px solid', borderColor: 'divider', py: 1 }}>
                {DATE_PRESETS.map(preset => (
                  <Box
                    key={preset.key}
                    onClick={() => handlePresetClick(preset)}
                    sx={{
                      px: 2,
                      py: 0.75,
                      cursor: 'pointer',
                      bgcolor: tempLabel === preset.label ? 'primary.softBg' : 'transparent',
                      color: tempLabel === preset.label ? 'primary.600' : 'text.primary',
                      '&:hover': { bgcolor: tempLabel === preset.label ? 'primary.softBg' : 'neutral.softHoverBg' },
                    }}
                  >
                    <Typography level="body-sm">{preset.label}</Typography>
                  </Box>
                ))}
              </Box>
            )}

            {/* Calendars */}
            <Box sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <IconButton size="sm" variant="plain" onClick={goToPrevMonth}>
                  <ArrowLeftIcon />
                </IconButton>
                <IconButton size="sm" variant="plain" onClick={goToNextMonth}>
                  <ArrowRightIcon />
                </IconButton>
              </Stack>
              <Stack direction="row" spacing={3}>
                {renderMonth(viewYear, viewMonth)}
                {months === 2 && renderMonth(nextYear, nextMonth)}
              </Stack>
            </Box>
          </Box>

          <Divider />

          {/* Footer — en 1 mes se apila (texto arriba, botones abajo) para
              que no se desordene en el panel angosto; en 2 meses va en fila */}
          <Stack
            direction={months === 1 ? 'column' : 'row'}
            spacing={1}
            justifyContent="space-between"
            alignItems={months === 1 ? 'stretch' : 'center'}
            sx={{ p: 1.5 }}
          >
            <Typography level="body-sm" noWrap sx={{ fontWeight: 500 }}>
              {tempSince && tempUntil
                ? `${formatDisplayDate(tempSince)} — ${formatDisplayDate(tempUntil)}`
                : 'Selecciona un rango'}
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ flexShrink: 0 }}>
              {allowClear && (
                <Button size="sm" variant="plain" color="danger" onClick={handleClear}>
                  Limpiar
                </Button>
              )}
              <Button size="sm" variant="plain" color="neutral" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button size="sm" variant="solid" onClick={handleApply}>
                Aplicar
              </Button>
            </Stack>
          </Stack>
        </Sheet>
      )}
    </Box>
  )
}
