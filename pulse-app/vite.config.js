import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
  server: {
    host: true,
    port: 5173,
    // Local development proxy: point VITE_API_BASE_URL at "/api" and run the
    // backend on port 8000 — requests are forwarded without CORS setup.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
