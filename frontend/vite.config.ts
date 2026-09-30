import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  // Strip console.log/debug from production bundles; errors and warnings are kept
  esbuild: {
    pure: mode === 'production' ? ['console.log', 'console.debug'] : []
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  publicDir: 'public'
}))
