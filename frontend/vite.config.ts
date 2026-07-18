import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // [Fase2·G.0] design system Tailwind v4
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // [Ola 1 · higiene] En producción se podan los console de ruido (log/info/debug/
  // trace) del bundle: no se sirven al navegador ni pueden filtrar datos por
  // descuido. Se PRESERVAN console.error y console.warn a propósito — son 409 de
  // los 600 console del front (manejo de errores en catch) y sin ellos producción
  // se queda sin ninguna señal para soporte. La contención de secretos es la Ola 0
  // (borrado manual); esta poda es defensa en profundidad, no el control principal.
  // `pure` requiere minify (activo por defecto en build).
  esbuild:
    mode === 'production'
      ? {
          pure: ['console.log', 'console.info', 'console.debug', 'console.trace'],
          drop: ['debugger'],
        }
      : {},
  plugins: [react(), tailwindcss()],
  define: {
    'process.env': {},
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: ['chat.chateam.ws', 'localhost', '127.0.0.1'],
    proxy: {
      // Proxy API al backend
      '/api/': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // Configuración para preview (producción local)
  preview: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: ['chat.chateam.ws', 'localhost', '127.0.0.1'],
  },
  build: {
    outDir: 'dist',
    // [Fase D] Sin sourcemaps en prod: evita exponer el código fuente (10.7 MB de .map servidos) y reduce el build.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'mui-joy': ['@mui/joy'],
          'mui-icons': ['@mui/icons-material'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts': ['recharts'],
        },
      },
    },
  },
}))
