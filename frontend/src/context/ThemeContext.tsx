import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react'
import { buildChateamTheme } from '../theme/chateamTheme'
import { buildFacebookTheme, buildFacebookDesignTokens } from '../themes/facebookTheme'

export interface ThemeColors {
  primaryLight: string
  primaryDark: string
  secondaryLight: string
  secondaryDark: string
}

const DEFAULTS: ThemeColors = {
  primaryLight: '#3b82f6',
  primaryDark: '#3b82f6',
  secondaryLight: '#52b788',
  secondaryDark: '#52b788',
}

const STORAGE_KEY = 'companyThemeColors'

function loadFromStorage(): ThemeColors {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) }
  } catch { /* fallback to defaults */ }
  return DEFAULTS
}

interface ThemeContextType {
  colors: ThemeColors
  chateamTheme: ReturnType<typeof buildChateamTheme>
  facebookTheme: ReturnType<typeof buildFacebookTheme>
  facebookDesignTokens: ReturnType<typeof buildFacebookDesignTokens>
  setColors: (colors: ThemeColors) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colors, setColorsState] = useState<ThemeColors>(loadFromStorage)

  const setColors = useCallback((newColors: ThemeColors) => {
    setColorsState(newColors)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newColors))
  }, [])

  const chateamTheme = useMemo(
    () => buildChateamTheme(colors.primaryLight, colors.primaryDark),
    [colors.primaryLight, colors.primaryDark]
  )

  const facebookTheme = useMemo(
    () => buildFacebookTheme(colors.primaryLight, colors.primaryDark),
    [colors.primaryLight, colors.primaryDark]
  )

  const facebookDesignTokens = useMemo(
    () => buildFacebookDesignTokens(colors.primaryLight, colors.primaryDark),
    [colors.primaryLight, colors.primaryDark]
  )

  return (
    <ThemeContext.Provider value={{ colors, chateamTheme, facebookTheme, facebookDesignTokens, setColors }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useThemeColors() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeColors must be used within ThemeProvider')
  return ctx
}
