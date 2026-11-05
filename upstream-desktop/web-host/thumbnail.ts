/**
 * Electron-free replacement for src/main/services/thumbnails.ts.
 *
 * The desktop version returns file:// URLs (blocked for an http origin) and
 * OS shell icons (Electron only). Here, image files are read and returned as
 * data: URLs (capped, they are preview thumbnails); everything else —
 * including videos, which the renderer decodes client-side when it can —
 * reports "none" so the UI shows its category icon.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { ThumbnailResult } from '@shared/ipc'

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif'
}

/** Refuse to inline anything bigger than this (previews, not viewers). */
const MAX_BYTES = 15 * 1024 * 1024

export async function thumbnailFor(filePath: string): Promise<ThumbnailResult> {
  try {
    if (!filePath) return { kind: 'none', src: null }
    const mime = IMAGE_MIME[path.extname(filePath).toLowerCase()]
    if (!mime) return { kind: 'none', src: null }
    const st = await fs.promises.stat(filePath)
    if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) return { kind: 'none', src: null }
    const buf = await fs.promises.readFile(filePath)
    return { kind: 'image', src: `data:${mime};base64,${buf.toString('base64')}` }
  } catch {
    return { kind: 'none', src: null }
  }
}
