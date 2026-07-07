import { defineConfig } from 'vite'

export default defineConfig({
  root: './src',
  publicDir: '../public',
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 650,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        index: './src/index.html',
        crafts: './src/crafts.html',
        generator: './src/generator.html'
      },
      output: {
        manualChunks: {
          three: ['three']
        }
      }
    }
  }
})
