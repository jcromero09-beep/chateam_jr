import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * [Barrido UI] Evita la pantalla en blanco al navegar a una ruta lazy.
 *
 * Con ~158 rutas lazy y solo <Suspense> (que cubre la CARGA, no el RECHAZO), un
 * import() dinamico fallido —tipico tras un redespliegue: el chunk viejo ya no
 * existe— tira el error, y sin error boundary React desmontaba TODO el arbol =>
 * blanco. El usuario tenia que refrescar a mano.
 *
 * Aqui: si el error huele a chunk/import fallido, se recarga UNA vez (trae el
 * index.html nuevo con los hashes nuevos). El flag en sessionStorage evita bucle
 * de recargas si el fallo fuese real y persistente. Cualquier otro error muestra
 * un fallback con boton, no un blanco.
 */
const RELOAD_FLAG = 'chunk-reload-attempted'

const isChunkError = (error: unknown): boolean => {
  const msg = String((error as Error)?.message || error || '')
  return (
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /'text\/html' is not a valid JavaScript MIME type/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  )
}

type Props = { children: ReactNode }
type State = { failed: boolean }

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(error: unknown): State {
    if (isChunkError(error)) {
      // Recargar una sola vez: si ya se intento, no reintentar (evita bucle).
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1')
        window.location.reload()
        return { failed: false }
      }
    }
    return { failed: true }
  }

  componentDidMount() {
    // Navegacion exitosa => limpiar el flag para permitir un futuro auto-reload.
    if (!this.state.failed) sessionStorage.removeItem(RELOAD_FLAG)
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ChunkErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (this.state.failed) {
      return (
        <div style={{ padding: 32, textAlign: 'center', maxWidth: 420, margin: '15vh auto' }}>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            No se pudo cargar esta sección
          </p>
          <p style={{ color: '#64748b', marginBottom: 20 }}>
            Puede que haya una versión nueva disponible.
          </p>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(RELOAD_FLAG)
              window.location.reload()
            }}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: '#0f4c5c', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ChunkErrorBoundary
