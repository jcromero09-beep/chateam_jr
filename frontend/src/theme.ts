import { extendTheme } from '@mui/joy/styles'

const theme = extendTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: {
          50: '#E3F2FD',
          100: '#BBDEFB',
          200: '#90CAF9',
          300: '#64B5F6',
          400: '#42A5F5',
          500: '#0B6BCB',
          600: '#0959AA',
          700: '#064689',
          800: '#043468',
          900: '#02204D',
        },
        success: {
          500: '#25D366', // WhatsApp green
        },
        neutral: {
          50: '#F7F7F8',
          100: '#EBEBEF',
          200: '#D8D8DF',
          300: '#B9B9C6',
          400: '#8F8FA3',
          500: '#73738C',
          600: '#5A5A72',
          700: '#434356',
          800: '#2F2F42',
          900: '#1F1F2E',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          50: '#C0E7FF',
          100: '#A6DDFF',
          200: '#7CC8FF',
          300: '#52B3FF',
          400: '#289EFF',
          500: '#0B6BCB',
          600: '#0959AA',
          700: '#064689',
          800: '#043468',
          900: '#02204D',
        },
        success: {
          500: '#25D366',
        },
        neutral: {
          50: '#1F1F2E',
          100: '#2F2F42',
          200: '#434356',
          300: '#5A5A72',
          400: '#73738C',
          500: '#8F8FA3',
          600: '#B9B9C6',
          700: '#D8D8DF',
          800: '#EBEBEF',
          900: '#F7F7F8',
        },
      },
    },
  },
  fontFamily: {
    display: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    body: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
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
  radius: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
  },
  shadow: {
    xs: '0px 1px 2px rgba(0, 0, 0, 0.08)',
    sm: '0px 2px 4px rgba(0, 0, 0, 0.08)',
    md: '0px 4px 8px rgba(0, 0, 0, 0.08)',
    lg: '0px 8px 16px rgba(0, 0, 0, 0.08)',
    xl: '0px 12px 24px rgba(0, 0, 0, 0.12)',
  },
})

export default theme
