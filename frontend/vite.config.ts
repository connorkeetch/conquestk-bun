import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // We defer registration via app code to avoid early main-thread work
      injectRegister: null,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Keep plugin-generated manifest in sync with public/manifest.json
      // This avoids conflicting data when the plugin injects a <link rel="manifest">.
      manifest: JSON.parse(
        fs.readFileSync(path.resolve(__dirname, 'public/manifest.json'), 'utf8'),
      ),
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-redux', '@reduxjs/toolkit'],
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
    sourcemap: false, // Disable sourcemaps in production for smaller bundle size
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          redux: ['@reduxjs/toolkit', 'react-redux'],
          ui: ['lucide-react', 'framer-motion'],
          forms: ['react-hook-form', '@hookform/resolvers'],
          utils: ['axios', 'bad-words', 'dompurify'],
          audio: ['howler'],
        },
      },
    },
    chunkSizeWarningLimit: 800, // Reduced from 1000 to encourage better splitting
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
