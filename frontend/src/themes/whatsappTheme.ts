/**
 * WhatsApp Web 2024 Theme
 * Réplica exacta de los colores, tipografía y componentes de WhatsApp Web
 */

import { extendTheme } from '@mui/joy/styles'

// Colores exactos de WhatsApp Web 2024
const whatsappColors = {
  // Backgrounds
  chatBackground: '#111B21',      // Chat area background
  sidebarBackground: '#202C33',   // Sidebar/Header background
  inputBackground: '#2A3942',     // Input fields background
  hoverBackground: '#2A3942',     // Hover state

  // WhatsApp Green palette
  whatsappGreen: '#25D366',       // WhatsApp brand green
  teal: '#00A884',                // Teal (hover/active)
  darkGreen: '#005C4B',           // Dark green (sent messages)

  // Text colors
  textPrimary: '#E9EDEF',         // Main text
  textSecondary: '#8696A0',       // Timestamps/metadata
  textTertiary: '#667781',        // Disabled/placeholder

  // Border & Divider
  border: '#2A3942',
  divider: '#2A3942',

  // Status colors
  unreadBadge: '#25D366',
  starColor: '#F1C232',
}

export const whatsappTheme = extendTheme({
  colorSchemes: {
    light: {
      palette: {
        background: {
          body: '#EFEAE2',              // Chat background (light beige)
          surface: '#F0F2F5',           // Sidebar background (light gray)
          level1: '#FFFFFF',            // Input background
          level2: '#E9EDEF',            // Hover background
        },
        primary: {
          50: '#E6F7F2',
          100: '#B3E9D9',
          200: '#80DABF',
          300: '#4DCBA6',
          400: '#26BF8C',
          500: whatsappColors.teal,          // main: #00A884
          600: '#009670',
          700: '#00845D',
          800: '#00724A',
          900: whatsappColors.darkGreen,     // dark: #005C4B
          plainColor: whatsappColors.whatsappGreen,
          solidBg: whatsappColors.teal,
          solidHoverBg: '#009670',
          solidActiveBg: whatsappColors.darkGreen,
        },
        success: {
          500: whatsappColors.whatsappGreen,
          solidBg: whatsappColors.whatsappGreen,
        },
        neutral: {
          50: '#FAFAFA',
          100: '#F0F2F5',
          200: '#E9EDEF',
          300: '#8696A0',            // Secondary text
          400: '#667781',            // Tertiary text
          500: '#54656F',
          600: '#3B4A54',
          700: '#E9EDEF',            // Border (light)
          800: '#D1D7DB',
          900: '#111B21',
          plainColor: '#54656F',
        },
        text: {
          primary: '#111B21',        // Dark text for light mode
          secondary: '#667781',      // Gray text
          tertiary: '#8696A0',       // Lighter gray
        },
        divider: '#E9EDEF',
      },
    },
    dark: {
      palette: {
        background: {
          body: whatsappColors.chatBackground,
          surface: whatsappColors.sidebarBackground,
          level1: whatsappColors.inputBackground,
          level2: whatsappColors.hoverBackground,
        },
        primary: {
          50: '#E6F7F2',
          100: '#B3E9D9',
          200: '#80DABF',
          300: '#4DCBA6',
          400: '#26BF8C',
          500: whatsappColors.teal,          // main: #00A884
          600: '#009670',
          700: '#00845D',
          800: '#00724A',
          900: whatsappColors.darkGreen,     // dark: #005C4B
          plainColor: whatsappColors.whatsappGreen,
          solidBg: whatsappColors.teal,
          solidHoverBg: '#009670',
          solidActiveBg: whatsappColors.darkGreen,
        },
        success: {
          500: whatsappColors.whatsappGreen,
          solidBg: whatsappColors.whatsappGreen,
        },
        neutral: {
          50: '#F5F6F6',
          100: '#E9EDEF',
          200: '#D1D7DB',
          300: whatsappColors.textSecondary,  // #8696A0
          400: whatsappColors.textTertiary,   // #667781
          500: '#54656F',
          600: '#3B4A54',
          700: whatsappColors.border,         // #2A3942
          800: whatsappColors.sidebarBackground, // #202C33
          900: whatsappColors.chatBackground, // #111B21
          plainColor: whatsappColors.textSecondary,
        },
        text: {
          primary: whatsappColors.textPrimary,
          secondary: whatsappColors.textSecondary,
          tertiary: whatsappColors.textTertiary,
        },
        divider: whatsappColors.divider,
      },
    },
  },

  fontFamily: {
    body: "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    display: "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  fontWeight: {
    xs: 200,
    sm: 300,
    md: 400,
    lg: 500,
    xl: 600,
  },
  typography: {
    h1: { fontSize: '2rem', fontWeight: 600 },
    h2: { fontSize: '1.5rem', fontWeight: 600 },
    h3: { fontSize: '1.25rem', fontWeight: 600 },
    h4: { fontSize: '1.125rem', fontWeight: 600 },
    'title-lg': { fontSize: '16px', fontWeight: 500 },
    'title-md': { fontSize: '14px', fontWeight: 500 },
    'body-lg': { fontSize: '16px', fontWeight: 400 },
    'body-md': { fontSize: '14.2px', fontWeight: 400 },
    'body-sm': { fontSize: '13px', fontWeight: 400 },
    'body-xs': { fontSize: '12px', fontWeight: 400 },
  },

  spacing: 8, // Base spacing unit

  radius: {
    xs: '2px',
    sm: '4px',
    md: '7.5px',  // WhatsApp message bubble radius
    lg: '12px',
    xl: '16px',
  },

  shadow: {
    xs: '0 1px 2px 0 rgba(0,0,0,.08)',
    sm: '0 1px 0.5px rgba(11,20,26,.13)',
    md: '0 2px 4px 0 rgba(0,0,0,.12)',
    lg: '0 4px 8px 0 rgba(0,0,0,.16)',
    xl: '0 8px 16px 0 rgba(0,0,0,.20)',
  },

  components: {
    JoyButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: theme.vars.radius.md,
          fontWeight: 500,
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'translateY(-1px)',
          },
        }),
      },
    },

    JoyIconButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: whatsappColors.textSecondary,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: whatsappColors.hoverBackground,
            color: whatsappColors.teal,
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
          backgroundColor: whatsappColors.inputBackground,
          borderRadius: theme.vars.radius.md,
          border: 'none',
          '&:focus-within': {
            boxShadow: `0 0 0 2px ${whatsappColors.teal}33`,
          },
          '&::placeholder': {
            color: whatsappColors.textTertiary,
          },
        }),
      },
    },

    JoyTextarea: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: whatsappColors.inputBackground,
          borderRadius: theme.vars.radius.md,
          border: 'none',
          color: whatsappColors.textPrimary,
          '&:focus-within': {
            boxShadow: `0 0 0 2px ${whatsappColors.teal}33`,
          },
          '&::placeholder': {
            color: whatsappColors.textTertiary,
          },
        }),
      },
    },

    JoyListItem: {
      styleOverrides: {
        root: {
          borderRadius: '0px',
          transition: 'background-color 0.2s ease',
        },
      },
    },

    JoyListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: '0px',
          transition: 'background-color 0.2s ease',
          '&:hover': {
            backgroundColor: whatsappColors.hoverBackground,
          },
          '&.Mui-selected': {
            backgroundColor: whatsappColors.hoverBackground,
            '&:hover': {
              backgroundColor: whatsappColors.hoverBackground,
            },
          },
        },
      },
    },

    JoySheet: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: theme.vars.radius.md,
          backgroundColor: whatsappColors.sidebarBackground,
        }),
      },
    },

    JoyCard: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: theme.vars.radius.md,
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: theme.vars.shadow.lg,
          },
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

    JoyBadge: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
        badge: {
          backgroundColor: whatsappColors.unreadBadge,
          color: '#000000',
          fontWeight: 600,
        },
      },
    },

    JoyAvatar: {
      styleOverrides: {
        root: {
          fontWeight: 500,
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
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: whatsappColors.hoverBackground,
          },
          '&.Mui-selected': {
            color: whatsappColors.teal,
          },
        }),
      },
    },

    JoySelect: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: whatsappColors.inputBackground,
          borderRadius: theme.vars.radius.md,
          border: 'none',
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
  },
})

// WhatsApp-specific design tokens
export const whatsappDesignTokens = {
  // Layout
  sidebar: {
    width: 400,
    headerHeight: 60,
  },

  // List items
  ticketItem: {
    height: 72,
    padding: '10px 16px',
    avatarSize: 49,
  },

  // Message bubbles
  message: {
    maxWidth: '65%',
    padding: '7px 9px 8px',
    borderRadius: '7.5px',
    tailSize: 8,
    outgoing: {
      background: whatsappColors.darkGreen,    // Dark mode
      backgroundLight: '#DCF8C6',              // Light mode (WhatsApp green)
      color: whatsappColors.textPrimary,
      colorLight: '#111B21',                   // Dark text for light mode
    },
    incoming: {
      background: whatsappColors.sidebarBackground,  // Dark mode
      backgroundLight: '#FFFFFF',                    // Light mode (white)
      color: whatsappColors.textPrimary,
      colorLight: '#111B21',                         // Dark text for light mode
    },
  },

  // Input area
  messageInput: {
    height: 62,
    padding: '10px 16px',
    iconSize: 24,
  },

  // Chat header
  chatHeader: {
    height: 60,
    padding: '10px 16px',
  },

  // Colors for quick access
  colors: whatsappColors,
}

export default whatsappTheme
