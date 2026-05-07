import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    minify: 'terser',
    sourcemap: false,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          icons: ['lucide-react'],
          excel: ['exceljs'],
        }
      }
    },
    target: 'es2020',
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
  },
  server: {
    hmr: { overlay: true }
  },
  esbuild: {
    drop: ['console', 'debugger'],
  }
})