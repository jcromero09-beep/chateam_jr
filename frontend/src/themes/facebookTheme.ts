/**
 * Messenger Theme - Dinamico
 * Tema inspirado en la estetica visual de Messenger con color primario configurable
 * Soporta modo claro y oscuro con transiciones suaves
 */

import { extendTheme } from '@mui/joy/styles'
import { generatePalette } from '../theme/generatePalette'

// Colores fijos de Messenger (no cambian con el color primario)
const fixedColors = {
  light: {
    bgPrimary: '#FFFFFF',
    bgSecondary: '#F0F2F5',
    bgChat: '#FFFFFF',
    border: '#DADDE1',
    textPrimary: '#050505',
    textSecondary: '#65676B',
    textTertiary: '#8A8D91',
    activeGreen: '#31A24C',
    criticalRed: '#E41E3F',
    hover: '#E4E6EB',
    inputBackground: '#F0F2F5',
    divider: '#DADDE1',
  },
  dark: {
    bgPrimary: '#18191A',
    bgSecondary: '#242526',
    bgChat: '#18191A',
    border: '#3A3B3C',
    textPrimary: '#E4E6EB',
    textSecondary: '#B0B3B8',
    textTertiary: '#8A8D91',
    activeGreen: '#31A24C',
    criticalRed: '#F02849',
    hover: '#3A3B3C',
    inputBackground: '#3A3B3C',
    divider: '#3A3B3C',
  },
}

export function buildFacebookTheme(primaryLight = '#5BC2D2', primaryDark = '#6FD4E4') {
  const lightPalette = generatePalette(primaryLight)
  const darkPalette = generatePalette(primaryDark)

  return extendTheme({
    colorSchemes: {
      light: {
        palette: {
          background: {
            body: fixedColors.light.bgPrimary,
            surface: fixedColors.light.bgSecondary,
            level1: fixedColors.light.bgPrimary,
            level2: fixedColors.light.hover,
            level3: fixedColors.light.bgSecondary,
          },
          primary: {
            ...lightPalette,
            plainColor: primaryLight,
            solidBg: primaryLight,
            solidHoverBg: lightPalette[600],
            solidActiveBg: lightPalette[700],
          },
          success: {
            50: '#E6F6EC',
            100: '#C0E9D0',
            200: '#9ADBB4',
            300: '#74CE98',
            400: '#4EC07C',
            500: fixedColors.light.activeGreen,
            600: '#2C9244',
            700: '#27823C',
            800: '#227234',
            900: '#1D622C',
            solidBg: fixedColors.light.activeGreen,
          },
          danger: {
            50: '#FDE8EB',
            100: '#FAC5CE',
            200: '#F7A2B1',
            300: '#F47F94',
            400: '#F15C77',
            500: fixedColors.light.criticalRed,
            600: '#CD1B39',
            700: '#B61833',
            800: '#9F152D',
            900: '#881227',
            solidBg: fixedColors.light.criticalRed,
          },
          neutral: {
            50: '#FAFAFA',
            100: fixedColors.light.bgSecondary,
            200: fixedColors.light.hover,
            300: fixedColors.light.border,
            400: '#BCC0C4',
            500: fixedColors.light.textTertiary,
            600: fixedColors.light.textSecondary,
            700: '#4B4F54',
            800: '#31353A',
            900: fixedColors.light.textPrimary,
            plainColor: fixedColors.light.textSecondary,
          },
          text: {
            primary: fixedColors.light.textPrimary,
            secondary: fixedColors.light.textSecondary,
            tertiary: fixedColors.light.textTertiary,
          },
          divider: fixedColors.light.divider,
        },
      },
      dark: {
        palette: {
          background: {
            body: fixedColors.dark.bgPrimary,
            surface: fixedColors.dark.bgSecondary,
            level1: fixedColors.dark.inputBackground,
            level2: fixedColors.dark.hover,
            level3: fixedColors.dark.bgSecondary,
          },
          primary: {
            ...darkPalette,
            plainColor: primaryDark,
            solidBg: primaryDark,
            solidHoverBg: darkPalette[600],
            solidActiveBg: darkPalette[700],
          },
          success: {
            50: '#E6F6EC',
            100: '#C0E9D0',
            200: '#9ADBB4',
            300: '#74CE98',
            400: '#4EC07C',
            500: fixedColors.dark.activeGreen,
            600: '#2C9244',
            700: '#27823C',
            800: '#227234',
            900: '#1D622C',
            solidBg: fixedColors.dark.activeGreen,
          },
          danger: {
            50: '#FFE8EC',
            100: '#FFC5CF',
            200: '#FFA2B2',
            300: '#FF7F95',
            400: '#FF5C78',
            500: fixedColors.dark.criticalRed,
            600: '#D82442',
            700: '#C0203B',
            800: '#A81C34',
            900: '#90182D',
            solidBg: fixedColors.dark.criticalRed,
          },
          neutral: {
            50: '#F5F5F5',
            100: fixedColors.dark.textPrimary,
            200: '#CED0D4',
            300: fixedColors.dark.textSecondary,
            400: fixedColors.dark.textTertiary,
            500: '#6A6C70',
            600: '#4A4C50',
            700: fixedColors.dark.border,
            800: fixedColors.dark.bgSecondary,
            900: fixedColors.dark.bgPrimary,
            plainColor: fixedColors.dark.textSecondary,
          },
          text: {
            primary: fixedColors.dark.textPrimary,
            secondary: fixedColors.dark.textSecondary,
            tertiary: fixedColors.dark.textTertiary,
          },
          divider: fixedColors.dark.divider,
        },
      },
    },

    fontFamily: {
      body: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
      display: '"Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
      code: '"SF Mono", "Fira Code", "Consolas", "Monaco", monospace',
    },
    fontWeight: {
      xs: 300,
      sm: 400,
      md: 500,
      lg: 600,
      xl: 700,
    },
    typography: {
      h1: { fontSize: '2rem', fontWeight: 700 },
      h2: { fontSize: '1.5rem', fontWeight: 700 },
      h3: { fontSize: '1.25rem', fontWeight: 600 },
      h4: { fontSize: '1.125rem', fontWeight: 600 },
      'title-lg': { fontSize: '17px', fontWeight: 600 },
      'title-md': { fontSize: '15px', fontWeight: 600 },
      'title-sm': { fontSize: '14px', fontWeight: 600 },
      'body-lg': { fontSize: '16px', fontWeight: 400 },
      'body-md': { fontSize: '15px', fontWeight: 400 },
      'body-sm': { fontSize: '14px', fontWeight: 400 },
      'body-xs': { fontSize: '12px', fontWeight: 400 },
    },

    spacing: 8,

    radius: {
      xs: '4px',
      sm: '6px',
      md: '8px',
      lg: '12px',
      xl: '18px',
    },

    shadow: {
      xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
      sm: '0 1px 2px rgba(0, 0, 0, 0.1)',
      md: '0 2px 4px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
      lg: '0 4px 8px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)',
      xl: '0 8px 16px rgba(0, 0, 0, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1)',
    },

    components: {
      JoyButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: '20px',
            fontWeight: 600,
            textTransform: 'none' as const,
            transition: 'all 0.15s ease-in-out',
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: theme.vars.shadow.sm,
            },
            '&:active': {
              transform: 'translateY(0)',
            },
          }),
        },
      },
      JoyIconButton: {
        styleOverrides: {
          root: ({ theme, ownerState }) => ({
            borderRadius: '50%',
            transition: 'all 0.15s ease-in-out',
            color: ownerState.color ? undefined : theme.vars.palette.text.secondary,
            '&:hover': {
              backgroundColor: theme.vars.palette.background.level2,
              color: theme.vars.palette.primary[500],
            },
            '&:active': {
              transform: 'scale(0.95)',
            },
          }),
        },
      },
      JoyInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.vars.palette.background.level1,
            borderRadius: '20px',
            border: 'none',
            transition: 'all 0.2s ease-in-out',
            '&:focus-within': {
              boxShadow: `0 0 0 2px ${theme.vars.palette.primary[500]}40`,
            },
            '& input::placeholder': {
              color: theme.vars.palette.text.tertiary,
            },
          }),
        },
      },
      JoyTextarea: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.vars.palette.background.level1,
            borderRadius: theme.vars.radius.lg,
            border: 'none',
            transition: 'all 0.2s ease-in-out',
            '&:focus-within': {
              boxShadow: `0 0 0 2px ${theme.vars.palette.primary[500]}40`,
            },
            '& textarea::placeholder': {
              color: theme.vars.palette.text.tertiary,
            },
          }),
        },
      },
      JoySelect: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.vars.palette.background.level1,
            borderRadius: theme.vars.radius.md,
            border: 'none',
          }),
        },
      },
      JoyListItem: {
        styleOverrides: {
          root: {
            borderRadius: '8px',
            transition: 'background-color 0.15s ease-in-out',
          },
        },
      },
      JoyListItemButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: '8px',
            transition: 'all 0.15s ease-in-out',
            '&:hover': {
              backgroundColor: theme.vars.palette.background.level2,
            },
            '&.Mui-selected': {
              backgroundColor: `${theme.vars.palette.primary[500]}15`,
              '&:hover': {
                backgroundColor: `${theme.vars.palette.primary[500]}20`,
              },
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
      JoyChip: {
        styleOverrides: {
          root: () => ({
            borderRadius: '16px',
            fontWeight: 500,
          }),
        },
      },
      JoyBadge: {
        styleOverrides: {
          root: {
            fontWeight: 600,
          },
          badge: ({ theme }) => ({
            backgroundColor: theme.vars.palette.danger[500],
            color: '#FFFFFF',
            fontWeight: 600,
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
      JoyTabs: {
        styleOverrides: {
          root: {
            backgroundColor: 'transparent',
          },
        },
      },
      JoyTab: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.vars.radius.md,
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              backgroundColor: theme.vars.palette.background.level2,
            },
            '&.Mui-selected': {
              color: theme.vars.palette.primary[500],
              fontWeight: 600,
            },
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
              fontSize: '0.8125rem',
              letterSpacing: '0.3px',
            },
          },
        },
      },
    },
  })
}

export function buildFacebookDesignTokens(primaryLight = '#5BC2D2', primaryDark = '#6FD4E4') {
  return {
    sidebar: {
      width: 360,
      headerHeight: 56,
    },
    ticketItem: {
      height: 68,
      padding: '8px 12px',
      avatarSize: 48,
    },
    message: {
      maxWidth: '70%',
      padding: '8px 12px',
      borderRadius: '18px',
      tailSize: 0,
      outgoing: {
        background: '#2F8F9D',
        backgroundLight: '#C5EDF3',
        color: '#FFFFFF',
        colorLight: '#12343B',
      },
      incoming: {
        background: fixedColors.dark.hover,
        backgroundLight: fixedColors.light.hover,
        color: fixedColors.dark.textPrimary,
        colorLight: fixedColors.light.textPrimary,
      },
    },
    messageInput: {
      height: 52,
      padding: '8px 12px',
      iconSize: 20,
    },
    chatHeader: {
      height: 56,
      padding: '8px 16px',
    },
    card: {
      borderRadius: '12px',
      shadow: '0 1px 2px rgba(0,0,0,0.1)',
      shadowDark: '0 1px 2px rgba(0,0,0,0.3)',
    },
    colors: {
      ...fixedColors.light,
      primaryBlue: primaryLight,
      darkBgPrimary: fixedColors.dark.bgPrimary,
      darkBgSecondary: fixedColors.dark.bgSecondary,
      darkBgChat: fixedColors.dark.bgChat,
      darkBorder: fixedColors.dark.border,
      darkTextPrimary: fixedColors.dark.textPrimary,
      darkTextSecondary: fixedColors.dark.textSecondary,
      darkTextTertiary: fixedColors.dark.textTertiary,
      darkPrimaryBlue: primaryDark,
      darkActiveGreen: fixedColors.dark.activeGreen,
      darkCriticalRed: fixedColors.dark.criticalRed,
      darkHover: fixedColors.dark.hover,
      darkInputBackground: fixedColors.dark.inputBackground,
      darkDivider: fixedColors.dark.divider,
    },
  }
}

// Defaults para backward compatibility
export const facebookTheme = buildFacebookTheme()
export const facebookDesignTokens = buildFacebookDesignTokens()
export default facebookTheme
