/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const PUBLIC = [
  '/manifest.webmanifest',
  '/fonts/albert-sans-latin.woff2',
  '/icons/icon.svg',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

/** Emits sw.js with the exact list of built files, so the whole shell is cached at install. */
function serviceWorker(): Plugin {
  return {
    name: 'dr4w-home-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = [
        '/index.html',
        ...PUBLIC,
        ...Object.keys(bundle)
          .filter((f) => !f.endsWith('.map') && f !== 'index.html')
          .map((f) => `/${f}`),
      ]
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
      const source = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(files))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5180,
    proxy: {
      '/api': 'http://localhost:8791',
      '/health': 'http://localhost:8791',
      '/pair': 'http://localhost:8791',
    },
  },
  preview: { port: 5182 },
  build: { target: 'es2022' },
  test: { environment: 'jsdom' },
})
