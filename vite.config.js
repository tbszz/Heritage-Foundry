import { defineConfig, loadEnv } from 'vite'
import { defaultExclude } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/'
  const apiPort = process.env.PORT || env.PORT || '3000'

  return {
    base,
    root: './src',
    test: {
      // 只跑 tests/ 真身；output/(提交物副本)、tmp/(临时产物)等目录里的测试副本不拾取
      exclude: [...defaultExclude, 'output/**', 'tmp/**', '_company-brain-analysis/**', 'heritage-foundry-redesign/**', 'cover-image/**', '.codex-doc-work/**']
    },
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
