import { extendTheme } from '@mui/joy/styles'
import { generatePalette } from './generatePalette'

// ─────────────────────────────────────────────────────────────────────────────
// PALETAS DE COLOR LOTRU
// Exportadas para uso en selectores de paleta (admin, branding, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export const palatinateBlue = {
  50: '#ececfe',
  100: '#dad8fd',
  200: '#c7c5fc',
  300: '#8f8bfa',
  400: '#6964f8',
  500: '#443df6',
  600: '#3d37dd',
  700: '#292594',
  800: '#221f7b',
  900: '#14124a',
} as const

export const crayolaBlue = {
  50: '#eef4ff',
  100: '#d9e6ff',
  200: '#bcd4ff',
  300: '#8ebaff',
  400: '#5994ff',
  500: '#2d68ff',
  600: '#1b49f5',
  700: '#1436e1',
  800: '#172cb6',
  900: '#192b8f',
} as const

export const seaGreen = {
  50: '#eefbf2',
  100: '#d6f5df',
  200: '#b1e9c4',
  300: '#7ed7a2',
  400: '#48bf7b',
  500: '#26a360',
  600: '#18834c',
  700: '#157546',
  800: '#115433',
  900: '#0f452c',
} as const

export const malachiteGreen = {
  50: '#f0fdf2',
  100: '#dcfce3',
  200: '#bbf7c9',
  300: '#87eea0',
  400: '#4bdd6f',
  500: '#25d050',
  600: '#17a23a',
  700: '#167f31',
  800: '#16652b',
  900: '#145326',
} as const

export const metalicOrange = {
  50: '#fffaeb',
  100: '#fff2c6',
  200: '#ffe288',
  300: '#ffce4a',
  400: '#ffbb29',
  500: '#f99607',
  600: '#dd6f02',
  700: '#b74c06',
  800: '#943a0c',
  900: '#7a300d',
} as const

export const carminePink = {
  50: '#fef2f2',
  100: '#ffe1e1',
  200: '#ffc9c9',
  300: '#fea3a3',
  400: '#fb6e6e',
  500: '#f23a3a',
  600: '#e02222',
  700: '#bc1919',
  800: '#9c1818',
  900: '#811b1b',
} as const

/**
 * Gradientes Lotru — disponibles via theme.vars.palette.gradient[1..4]
 */
export const lotruGradients = {
  1: 'linear-gradient(120deg, #eefadc 0%, #fce5f3 100%)',
  2: 'linear-gradient(120deg, #cee7fe 0%, #eefadc 100%)',
  3: 'linear-gradient(120deg, #f9d8e7 0%, #cee7fe 100%)',
  4: 'linear-gradient(120deg, #c6d4f9 0%, #f9d8e7 100%)',
} as const

/**
 * Opciones predefinidas de paleta primaria (usadas en el selector de paleta del admin).
 * Las claves coinciden con el sistema Lotru para compatibilidad futura.
 */
export const PREDEFINED_PRIMARY_PALETTES = {
  palatinateBlue,
  crayolaBlue,
  seaGreen,
} as const

export type PredefinedPaletteName = keyof typeof PREDEFINED_PRIMARY_PALETTES

// ─────────────────────────────────────────────────────────────────────────────
// OVERRIDES DE COMPONENTES — Patrón Lotru
// ─────────────────────────────────────────────────────────────────────────────

const componentOverrides = {
  // ── Breadcrumbs ──────────────────────────────────────────────────────────
  JoyBreadcrumbs: {
    styleOverrides: {
      root: { padding: 0 },
    },
  },

  // ── Button ───────────────────────────────────────────────────────────────
  JoyButton: {
    styleOverrides: {
      root: ({ ownerState }: { ownerState: Record<string, unknown> }) => ({
        borderRadius: 'var(--joy-radius-md)',
        fontWeight: 600,
        textTransform: 'none' as const,
        transition: 'all 0.2s ease-in-out',
        ...(ownerState.variant === 'outlined' && {
          boxShadow: 'var(--joy-shadow-xs)',
        }),
        ...(ownerState.variant === 'solid' &&
          ownerState.color === 'neutral' && {
            '--variant-solidBg': 'var(--joy-palette-neutral-900)',
            '--variant-solidHoverBg': 'var(--joy-palette-neutral-700)',
          }),
      }),
    },
  },

  // ── Card ─────────────────────────────────────────────────────────────────
  JoyCard: {
    styleOverrides: {
      root: {
        borderRadius: 'var(--joy-radius-lg)',
        boxShadow: 'var(--joy-shadow-xs)',
        transition: 'all 0.2s ease-in-out',
      },
    },
  },

  // ── Drawer ───────────────────────────────────────────────────────────────
  JoyDrawer: {
    styleOverrides: {
      backdrop: { backdropFilter: 'none' },
    },
  },

  // ── IconButton ───────────────────────────────────────────────────────────
  JoyIconButton: {
    styleOverrides: {
      root: ({ ownerState }: { ownerState: Record<string, unknown> }) => ({
        borderRadius: 'var(--joy-radius-sm)',
        transition: 'all 0.2s ease-in-out',
        ...(ownerState.variant === 'outlined' && {
          boxShadow: 'var(--joy-shadow-sm)',
        }),
        ...(ownerState.variant === 'solid' &&
          ownerState.color === 'neutral' && {
            '--variant-solidBg': 'var(--joy-palette-neutral-900)',
            '--variant-solidHoverBg': 'var(--joy-palette-neutral-700)',
          }),
      }),
    },
  },

  // ── Input ────────────────────────────────────────────────────────────────
  JoyInput: {
    styleOverrides: {
      root: ({ ownerState }: { ownerState: Record<string, unknown> }) => ({
        transition: 'all 0.2s ease-in-out',
        ...(ownerState.variant === 'outlined' && {
          boxShadow: 'var(--joy-shadow-xs)',
        }),
      }),
    },
  },

  // ── Link ─────────────────────────────────────────────────────────────────
  JoyLink: {
    styleOverrides: {
      root: {
        textDecorationColor: 'var(--joy-palette-text-primary)',
        '&:hover': { color: 'var(--joy-palette-text-primary)' },
      },
    },
  },

  // ── Modal ────────────────────────────────────────────────────────────────
  JoyModal: {
    styleOverrides: {
      backdrop: { backdropFilter: 'none' },
      root: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
    },
  },

  // ── ModalDialog ──────────────────────────────────────────────────────────
  JoyModalDialog: {
    styleOverrides: {
      root: {
        borderRadius: 'var(--joy-radius-lg)',
        boxShadow: 'var(--joy-shadow-xl)',
      },
    },
  },

  // ── Select ───────────────────────────────────────────────────────────────
  JoySelect: {
    styleOverrides: {
      root: ({ ownerState }: { ownerState: Record<string, unknown> }) => ({
        borderRadius: 'var(--joy-radius-sm)',
        ...(ownerState.variant === 'outlined' && {
          boxShadow: 'var(--joy-shadow-xs)',
        }),
      }),
    },
  },

  // ── Sheet ────────────────────────────────────────────────────────────────
  JoySheet: {
    styleOverrides: {
      root: {
        borderRadius: 'var(--joy-radius-md)',
      },
    },
  },

  // ── Stack ────────────────────────────────────────────────────────────────
  JoyStack: {
    defaultProps: { useFlexGap: true },
  },

  // ── Table ────────────────────────────────────────────────────────────────
  JoyTable: {
    styleOverrides: {
      root: ({ ownerState }: { ownerState: Record<string, unknown> }) => ({
        '--Table-headerUnderlineThickness': '1px',
        '--TableRow-stripeBackground': 'var(--joy-palette-background-level1)',
        '--TableCell-borderColor': 'var(--joy-palette-divider)',
        '& thead th': {
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.5px',
        },
        ...(ownerState.borderAxis === 'header' && {
          '& thead th:not([colspan])': {
            borderBottom:
              'var(--Table-headerUnderlineThickness) solid var(--TableCell-borderColor)',
          },
        }),
      }),
    },
  },

  // ── Tabs ─────────────────────────────────────────────────────────────────
  JoyTabs: {
    styleOverrides: {
      root: ({ ownerState }: { ownerState: Record<string, unknown> }) => ({
        ...(ownerState.variant === 'custom' && {
          backgroundColor: 'transparent',
          '& .MuiTabList-root': {
            backgroundColor: 'var(--joy-palette-background-level1)',
            borderRadius: 'var(--joy-radius-md)',
            boxShadow: 'none',
            gap: '4px',
            padding: '4px',
          },
          '& .MuiTab-root': {
            borderRadius: 'var(--joy-radius-md)',
            flex: '1 1 auto',
            '&:after': { display: 'none' },
            '&.Mui-selected': {
              backgroundColor: 'var(--joy-palette-background-surface)',
              boxShadow: 'var(--joy-shadow-sm)',
            },
            '&:not(&.Mui-selected):hover': {
              backgroundColor: 'var(--joy-palette-background-level2)',
            },
          },
        }),
      }),
    },
  },

  // ── Textarea ─────────────────────────────────────────────────────────────
  JoyTextarea: {
    styleOverrides: {
      root: ({ ownerState }: { ownerState: Record<string, unknown> }) => ({
        transition: 'all 0.2s ease-in-out',
        ...(ownerState.variant === 'outlined' && {
          boxShadow: 'var(--joy-shadow-xs)',
        }),
      }),
    },
  },

  // ── Chip ─────────────────────────────────────────────────────────────────
  JoyChip: {
    styleOverrides: {
      root: {
        borderRadius: 'var(--joy-radius-sm)',
        fontWeight: 500,
      },
    },
  },

  // ── List ─────────────────────────────────────────────────────────────────
  JoyList: {
    styleOverrides: {
      root: { '--List-gap': '4px' },
    },
  },

  // ── ListItem ─────────────────────────────────────────────────────────────
  JoyListItem: {
    styleOverrides: {
      root: { borderRadius: '6px' },
    },
  },

  // ── ListItemButton ───────────────────────────────────────────────────────
  JoyListItemButton: {
    styleOverrides: {
      root: {
        borderRadius: 'var(--joy-radius-sm)',
        transition: 'all 0.15s ease-in-out',
        '&:hover': {
          backgroundColor: 'var(--joy-palette-background-level2)',
        },
        '&.Mui-selected': {
          backgroundColor: 'var(--joy-palette-primary-500)',
          color: 'var(--joy-palette-common-white)',
          fontWeight: 600,
          '&:hover': {
            backgroundColor: 'var(--joy-palette-primary-600)',
          },
        },
      },
    },
  },

  // ── Avatar ───────────────────────────────────────────────────────────────
  JoyAvatar: {
    styleOverrides: {
      root: { fontWeight: 600 },
    },
  },

  // ── Badge ────────────────────────────────────────────────────────────────
  JoyBadge: {
    styleOverrides: {
      root: { fontWeight: 600 },
    },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOGRAFÍA — Patrón Lotru
// h1-h4 y title-* usan 'Inter' como fuente de display
// El cuerpo usa 'Be Vietnam Pro'
// ─────────────────────────────────────────────────────────────────────────────

const typographyOverrides = {
  h1: {
    fontFamily: 'var(--joy-fontFamily-display)',
    fontWeight: 'var(--joy-fontWeight-xl)',
  },
  h2: {
    fontFamily: 'var(--joy-fontFamily-display)',
    fontWeight: 'var(--joy-fontWeight-xl)',
  },
  h3: {
    fontFamily: 'var(--joy-fontFamily-display)',
    fontWeight: 'var(--joy-fontWeight-lg)',
  },
  h4: {
    fontFamily: 'var(--joy-fontFamily-display)',
    fontWeight: 'var(--joy-fontWeight-lg)',
  },
  'title-lg': {
    fontFamily: 'var(--joy-fontFamily-display)',
    fontWeight: 'var(--joy-fontWeight-lg)',
  },
  'title-md': {
    fontFamily: 'var(--joy-fontFamily-display)',
    fontWeight: 'var(--joy-fontWeight-lg)',
  },
  'title-sm': {
    fontFamily: 'var(--joy-fontFamily-display)',
    fontWeight: 'var(--joy-fontWeight-lg)',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// buildChateamTheme — Constructor principal
//
// Preserva el color primario dinámico via generatePalette() para multi-tenancy.
// Los colores semánticos (success, warning, danger, neutral) usan las paletas
// Lotru exactas para consistencia visual con el sistema de diseño.
//
// @param primaryLight  Color hex para modo claro (default: palatinateBlue #443df6)
// @param primaryDark   Color hex para modo oscuro (default: palatinateBlue #443df6)
// ─────────────────────────────────────────────────────────────────────────────
export function buildChateamTheme(
  // [Fase B] Primario canónico teal (#14B8A6) — antes #3b82f6 (azul) chocaba con los fondos teal-navy.
  primaryLight = '#14B8A6',
  primaryDark = '#14B8A6',
) {
  const lightPalette = generatePalette(primaryLight)
  const darkPalette = generatePalette(primaryDark)

  return extendTheme({
    // ── Color Schemes ──────────────────────────────────────────────────────
    colorSchemes: {
      light: {
        palette: {
          // Color primario dinámico — preservado para multi-tenancy
          primary: lightPalette,

          // Colores semánticos Lotru
          success: { ...malachiteGreen },
          warning: { ...metalicOrange },
          danger: { ...carminePink },

          // Neutros (incluye token 950 de Lotru)
          neutral: {
            50: '#fafafa',
            100: '#f5f5f5',
            200: '#eeeeee',
            300: '#e0e0e0',
            400: '#bdbdbd',
            500: '#9e9e9e',
            600: '#757575',
            700: '#616161',
            800: '#424242',
            900: '#212121',
            outlinedBorder: 'var(--joy-palette-neutral-200)',
          },

          // Fondos — ChatEAM
          background: {
            backdrop: 'rgba(9, 10, 11, 0.8)',
            body: '#f8f9fa',
            surface: '#ffffff',
            level1: '#f1f3f5',
            level2: '#e9ecef',
            level3: '#dee2e6',
          },

          // Divisor
          divider: 'var(--joy-palette-neutral-200)',

          // Colores comunes
          common: { black: '#000000', white: '#ffffff' },

          // Texto — Lotru light
          text: {
            primary: 'var(--joy-palette-neutral-900)',
            secondary: 'var(--joy-palette-neutral-700)',
            tertiary: 'var(--joy-palette-neutral-500)',
          },
        } as any,
        shadowOpacity: '0.04',
      },

      dark: {
        palette: {
          // Color primario dinámico — preservado para multi-tenancy
          primary: darkPalette,

          // Colores semánticos Lotru
          success: { ...malachiteGreen },
          warning: { ...metalicOrange },
          danger: { ...carminePink },

          // Neutros (incluye token 950 de Lotru)
          neutral: {
            50: '#f5f5f5',
            100: '#e0e0e0',
            200: '#bdbdbd',
            300: '#9e9e9e',
            400: '#757575',
            500: '#616161',
            600: '#424242',
            700: '#303030',
            800: '#212121',
            900: '#121212',
            outlinedBorder: 'var(--joy-palette-neutral-700)',
          },

          // Fondos — ChatEAM dark (teal profundo)
          // --dark-bg:      #04222A  (fondo principal / body)
          // --dark-surface: #08303A  (header, cards y tablas)
          // Niveles 1-3 derivados en el mismo tinte teal para stripes,
          // hover y elementos elevados (jerarquía sutil, no gris/negro).
          background: {
            backdrop: 'rgba(2, 17, 21, 0.9)',
            body: '#04222A',
            surface: '#08303A',
            level1: '#0a3a48',
            level2: '#0d4756',
            level3: '#105668',
          },

          // Divisor — línea sutil sobre fondo teal (evita el gris frío)
          divider: 'rgba(255, 255, 255, 0.10)',

          // Gradientes Lotru
          gradient: lotruGradients,

          // Colores comunes
          common: { black: '#000000', white: '#ffffff' },

          // Texto — Lotru dark
          text: {
            primary: 'var(--joy-palette-common-white)',
            secondary: 'var(--joy-palette-neutral-200)',
            tertiary: 'var(--joy-palette-neutral-500)',
          },
        } as any,
        shadowOpacity: '0.3',
      },
    },

    // ── Tipografía — Lotru ─────────────────────────────────────────────────
    // body: 'Be Vietnam Pro' (Lotru), display: 'Inter' (headings)
    fontFamily: {
      body: "'Be Vietnam Pro', var(--joy-fontFamily-fallback)",
      display: "'Inter', var(--joy-fontFamily-fallback)",
      code: "'Roboto Mono', 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace",
    },

    // ── Escala tipográfica ─────────────────────────────────────────────────
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      md: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      xl2: '1.5rem',
      xl3: '1.875rem',
      xl4: '2.25rem',
    },

    // ── Pesos ─────────────────────────────────────────────────────────────
    fontWeight: {
      sm: 300,
      md: 400,
      lg: 500,
      xl: 600,
    },

    // ── Interlineado ──────────────────────────────────────────────────────
    lineHeight: {
      sm: 1.25,
      md: 1.5,
      lg: 1.75,
    },

    // ── Radios ────────────────────────────────────────────────────────────
    radius: {
      xs: '2px',
      sm: '4px',
      md: '8px',
      lg: '12px',
      xl: '16px',
    },

    // ── Sombras ───────────────────────────────────────────────────────────
    shadow: {
      xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    },

    // ── Overrides de tipografía heading/title — Lotru ─────────────────────
    typography: typographyOverrides,

    // ── Overrides de componentes — Lotru + ChatEAM ────────────────────────
    components: componentOverrides,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Exportaciones de compatibilidad hacia atrás
// chateamTheme usa el nuevo default palatinateBlue (#443df6)
// ─────────────────────────────────────────────────────────────────────────────
export const chateamTheme = buildChateamTheme()
export default chateamTheme
