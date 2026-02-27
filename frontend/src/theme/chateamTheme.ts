import { extendTheme } from '@mui/joy/styles'
import { generatePalette } from './generatePalette'

/**
 * Tema personalizado JR Chateam v6.0.0
 *
 * Tema corporativo con soporte para modo claro y oscuro
 * Optimizado para la plataforma omnicanal empresarial
 * Soporta colores dinamicos via buildChateamTheme()
 */
export function buildChateamTheme(primaryLight = '#5BC2D2', primaryDark = '#6FD4E4') {
  const lightPalette = generatePalette(primaryLight)
  const darkPalette = generatePalette(primaryDark)

  return extendTheme({
    colorSchemes: {
      light: {
        palette: {
          primary: lightPalette,
          success: {
            50: '#e8f5e9',
            100: '#c8e6c9',
            200: '#a5d6a7',
            300: '#81c784',
            400: '#66bb6a',
            500: '#4caf50',
            600: '#43a047',
            700: '#388e3c',
            800: '#2e7d32',
            900: '#1b5e20',
          },
          warning: {
            50: '#fff3e0',
            100: '#ffe0b2',
            200: '#ffcc80',
            300: '#ffb74d',
            400: '#ffa726',
            500: '#ff9800',
            600: '#fb8c00',
            700: '#f57c00',
            800: '#ef6c00',
            900: '#e65100',
          },
          danger: {
            50: '#ffebee',
            100: '#ffcdd2',
            200: '#ef9a9a',
            300: '#e57373',
            400: '#ef5350',
            500: '#f44336',
            600: '#e53935',
            700: '#d32f2f',
            800: '#c62828',
            900: '#b71c1c',
          },
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
          },
          background: {
            body: '#f5f7fa',
            surface: '#ffffff',
            level1: '#f8f9fa',
            level2: '#f0f2f5',
            level3: '#e9ecef',
          },
          text: {
            primary: '#1a1a1a',
            secondary: '#4a4a4a',
            tertiary: '#757575',
          },
        },
      },
      dark: {
        palette: {
          primary: darkPalette,
          success: {
            50: '#e8f5e9',
            100: '#c8e6c9',
            200: '#a5d6a7',
            300: '#81c784',
            400: '#66bb6a',
            500: '#4caf50',
            600: '#43a047',
            700: '#388e3c',
            800: '#2e7d32',
            900: '#1b5e20',
          },
          warning: {
            50: '#fff3e0',
            100: '#ffe0b2',
            200: '#ffcc80',
            300: '#ffb74d',
            400: '#ffa726',
            500: '#ff9800',
            600: '#fb8c00',
            700: '#f57c00',
            800: '#ef6c00',
            900: '#e65100',
          },
          danger: {
            50: '#ffebee',
            100: '#ffcdd2',
            200: '#ef9a9a',
            300: '#e57373',
            400: '#ef5350',
            500: '#f44336',
            600: '#e53935',
            700: '#d32f2f',
            800: '#c62828',
            900: '#b71c1c',
          },
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
          },
          background: {
            body: '#0a0e27',
            surface: '#141b2d',
            level1: '#1a2332',
            level2: '#1f2a37',
            level3: '#24303f',
          },
          text: {
            primary: '#ffffff',
            secondary: '#b8c5d6',
            tertiary: '#8a96a3',
          },
        },
      },
    },
    fontFamily: {
      body: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", sans-serif',
      display: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", sans-serif',
      code: '"Fira Code", "Consolas", "Monaco", "Courier New", monospace',
    },
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
    fontWeight: {
      sm: 300,
      md: 400,
      lg: 500,
      xl: 600,
    },
    lineHeight: {
      sm: 1.25,
      md: 1.5,
      lg: 1.75,
    },
    radius: {
      xs: '2px',
      sm: '4px',
      md: '8px',
      lg: '12px',
      xl: '16px',
    },
    shadow: {
      xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    },
    components: {
      JoyButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.md,
            fontWeight: 600,
            textTransform: 'none' as const,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: theme.vars.shadow.md,
            },
            '&:active': {
              transform: 'translateY(0)',
            },
          }),
        },
      },
      JoyCard: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.lg,
            boxShadow: theme.vars.shadow.sm,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              boxShadow: theme.vars.shadow.md,
            },
          }),
        },
      },
      JoySheet: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.md,
          }),
        },
      },
      JoyInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.sm,
            transition: 'all 0.2s ease-in-out',
            '&:focus-within': {
              boxShadow: `0 0 0 2px ${theme.vars.palette.primary[500]}33`,
            },
          }),
        },
      },
      JoyTextarea: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.sm,
            transition: 'all 0.2s ease-in-out',
            '&:focus-within': {
              boxShadow: `0 0 0 2px ${theme.vars.palette.primary[500]}33`,
            },
          }),
        },
      },
      JoySelect: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.sm,
          }),
        },
      },
      JoyChip: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.sm,
            fontWeight: 500,
          }),
        },
      },
      JoyModal: {
        styleOverrides: {
          root: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
      },
      JoyModalDialog: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.lg,
            boxShadow: theme.vars.shadow.xl,
          }),
        },
      },
      JoyTable: {
        styleOverrides: {
          root: {
            '& thead th': {
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              fontSize: '0.75rem',
              letterSpacing: '0.5px',
            },
          },
        },
      },
      JoyList: {
        styleOverrides: {
          root: {
            '--List-gap': '4px',
          },
        },
      },
      JoyListItem: {
        styleOverrides: {
          root: {
            borderRadius: '6px',
          },
        },
      },
      JoyListItemButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.sm,
            transition: 'all 0.15s ease-in-out',
            '&:hover': {
              backgroundColor: theme.vars.palette.background.level2,
            },
            '&.Mui-selected': {
              backgroundColor: theme.vars.palette.primary[500],
              color: theme.vars.palette.common.white,
              fontWeight: 600,
              '&:hover': {
                backgroundColor: theme.vars.palette.primary[600],
              },
            },
          }),
        },
      },
      JoyIconButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.sm,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              transform: 'scale(1.05)',
            },
            '&:active': {
              transform: 'scale(0.95)',
            },
          }),
        },
      },
      JoyAvatar: {
        styleOverrides: {
          root: {
            fontWeight: 600,
          },
        },
      },
      JoyBadge: {
        styleOverrides: {
          root: {
            fontWeight: 600,
          },
        },
      },
    },
  })
}

// Default para backward compatibility
export const chateamTheme = buildChateamTheme()
export default chateamTheme
