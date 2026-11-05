/**
 * Vite build for the UNMODIFIED renderer (src/renderer), producing the static
 * bundle the web host serves from web-host/dist/renderer.
 *
 * Same aliases and plugin as electron.vite.config.ts's renderer section; the
 * only differences are the output directory and that it runs without Electron.
 * The shim (web-host/dist/peardrop-api.js) is copied next to the output by
 * web-host/build.sh and referenced from src/renderer/index.html.
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = resolve(__dirname, '..')

export default defineConfig({
  root: resolve(repoRoot, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': resolve(repoRoot, 'src/engine'),
      '@shared': resolve(repoRoot, 'src/shared'),
      '@renderer': resolve(repoRoot, 'src/renderer')
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      input: { index: resolve(repoRoot, 'src/renderer/index.html') }
    }
  }
})
