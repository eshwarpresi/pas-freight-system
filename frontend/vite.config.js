import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    // Generate smaller chunks for faster loading
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'icons': ['lucide-react'],
        }
      }
    },
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,     // Remove console.logs in production
        drop_debugger: true
      }
    },
    // Generate sourcemaps only in dev
    sourcemap: false,
    // Chunk size warning limit
    chunkSizeWarningLimit: 500
  },
  server: {
    // Faster dev server
    hmr: { overlay: true }
  }
})