import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dev only: forwards to the API via the SSH tunnel on localhost:5296.
      '/api': 'http://localhost:5296',
    },
  },
})