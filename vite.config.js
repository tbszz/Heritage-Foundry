import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/'
  const apiPort = process.env.PORT || env.PORT || '3000'

  return {
    base,
    root: './src',
    publicDir: '../public',
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      open: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
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
          generator: './src/generator.html',
          ar: './src/ar.html'
        },
        output: {
          manualChunks: {
            three: ['three']
          }
        }
      }
    }
  }
})
