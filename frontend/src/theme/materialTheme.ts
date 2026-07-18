import { extendTheme } from '@mui/material/styles'

// Theme de MUI Material para coexistir con MUI Joy mediante THEME_ID.
// Los componentes de @mui/material (Dialog, Tooltip, etc.) necesitan un theme
// de Material con `transitions`, `zIndex`, `palette.mode`, etc. — que el theme
// de Joy (chateamTheme) NO provee. Sin esto, el Dialog crashea al leer
// `theme.transitions.duration`. Ver docs oficiales: Joy UI + Material UI.
const materialTheme = extendTheme()

export default materialTheme
