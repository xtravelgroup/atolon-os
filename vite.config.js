import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// VitePWA desactivado durante desarrollo — reactivar cuando el producto esté listo
// import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
})
