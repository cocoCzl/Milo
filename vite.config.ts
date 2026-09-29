import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Tauri's WebView cache persists between dev sessions. Vite otherwise
    // marks optimized dependencies as immutable for a year, which can leave a
    // cached entry importing chunks that a later optimization has replaced.
    // Revalidate with Vite so unchanged files can still use a cheap 304.
    headers: {
      'Cache-Control': 'no-cache',
    },
  },
  optimizeDeps: {
    // Bump this value if a previously immutable WebView dependency cache must
    // be invalidated. New responses use the revalidating policy above.
    esbuildOptions: {
      define: {
        __MILO_VITE_DEP_CACHE_VERSION__: '"1"',
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'safari13'],
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
