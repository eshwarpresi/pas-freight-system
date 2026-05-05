import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 500
  },
  server: {
    hmr: { overlay: true }
  }
})