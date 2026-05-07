import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// VitePWA desactivado durante desarrollo — reactivar cuando el producto esté listo
// import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    // Code splitting más agresivo: separamos vendors grandes en su propio
    // chunk para que cambien menos veces (mejor caché de browser).
    rollupOptions: {
      output: {
        // Solo separamos los vendors que se usan en el INITIAL load.
        // El resto (jspdf, html2canvas, jsQR, etc.) los dejamos en sus
        // chunks naturales para que solo se carguen cuando se necesitan.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          // React core (siempre cargado)
          if (id.includes('react-dom') || id.match(/[\\/]react[\\/]/) || id.includes('scheduler')) {
            return 'react-vendor'
          }
          // Supabase client (cargado al inicio para auth)
          if (id.includes('@supabase')) return 'supabase'
          // El resto: que Vite decida (Rollup lo separa por dependencia natural)
          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
})
