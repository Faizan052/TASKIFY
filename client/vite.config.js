import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    port: 5173,
    // Proxy API requests to the backend during development so `fetch('/api/...')` works
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
