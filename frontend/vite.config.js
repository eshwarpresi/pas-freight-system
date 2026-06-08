import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { writeFileSync } from 'fs'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'render-redirect',
      closeBundle() {
        writeFileSync(resolve(__dirname, 'dist', '_redirects'), '/*    /index.html   200\n')
      }
    }
  ],
  optimizeDeps: {
    include: ['jspdf', 'html2canvas'],
    esbuild: {
      loader: 'jsx',
    },
  },
  build: {
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'vendor';
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'query';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
          if (id.includes('node_modules/exceljs')) {
            return 'excel';
          }
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) {
            return 'pdf';
          }
        }
      }
    },
    target: 'es2020',
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
  },
  server: {
    hmr: { overlay: false }
  },
})