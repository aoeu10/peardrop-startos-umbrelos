/**
 * PearDrop Web UI Server for StartOS
 * 
 * Provides a browser-based interface for P2P file sharing.
 * Wraps the hyperdrive-manager to expose share/download/list/status
 * via a simple HTTP API + static HTML frontend.
 */

const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { manager } = require('./lib/hyperdrive-manager')
const { downloadFromDrive } = require('./lib/downloader')
const { readHistory, recordEvent } = require('./lib/access-history')
const { readSettings, writeSettings } = require('./lib/settings')

const PORT = 47931
const UPLOADS_DIR = path.join(os.homedir(), 'uploads')

// MIME types
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

// Ensure directories
async function ensureDirs() {
  const settings = await writeSettings(await readSettings())
  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true })
  await fs.promises.mkdir(settings.downloadDir, { recursive: true })
}

// Parse multipart form data (simple, no external deps)
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const boundary = req.headers['content-type']?.split('boundary=')[1]
    if (!boundary) return reject(new Error('No boundary'))
    
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const buf = Buffer.concat(chunks)
      const boundaryBuf = Buffer.from('--' + boundary)
      const files = []
      
      let pos = 0
      while (true) {
        const start = buf.indexOf(boundaryBuf, pos)
        if (start === -1) break
        
        const nextBoundary = buf.indexOf(boundaryBuf, start + boundaryBuf.length)
        if (nextBoundary === -1) break
        
        const part = buf.slice(start + boundaryBuf.length, nextBoundary)
        
        // Find header/body separator (\r\n\r\n)
        const headerEnd = part.indexOf('\r\n\r\n')
        if (headerEnd === -1) { pos = nextBoundary; continue }
        
        const headerStr = part.slice(0, headerEnd).toString()
        const body = part.slice(headerEnd + 4, part.length - 2) // -2 for trailing \r\n
        
        // Parse filename from Content-Disposition
        const nameMatch = headerStr.match(/name="([^"]+)"/)
        const fileMatch = headerStr.match(/filename="([^"]+)"/)
        
        if (fileMatch && fileMatch[1]) {
          files.push({
            field: nameMatch?.[1] || 'file',
            filename: fileMatch[1],
            data: body,
            size: body.length
          })
        }
        
        pos = nextBoundary
      }
      
      resolve(files)
    })
    req.on('error', reject)
  })
}

// Send JSON response
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function normalizeDataPath(value, fallback) {
  const target = String(value || fallback || '').trim()
  if (!target || !path.isAbsolute(target)) throw new Error('Path must be absolute')
  if (!target.startsWith('/data/')) throw new Error('Path must be inside /data')
  return target.replace(/\/+$/, '')
}

async function listFilesRecursive(root, base = root) {
  const files = []
  try {
    const entries = await fs.promises.readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name)
      if (entry.isDirectory()) {
        files.push(...await listFilesRecursive(fullPath, base))
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(fullPath)
        files.push({
          name: entry.name,
          path: fullPath,
          relativePath: path.relative(base, fullPath),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        })
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  return files
}

function tarGz(sourceDir, outputFile) {
  return new Promise((resolve, reject) => {
    execFile('tar', ['-czf', outputFile, '-C', sourceDir, '.'], (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve({ stdout, stderr })
    })
  })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isMedia(ext) {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg', '.pdf', '.txt'].includes(ext.toLowerCase())
}

async function resolveDataFile(rawPath) {
  const decoded = String(rawPath || '')
  if (!decoded || !path.isAbsolute(decoded)) throw new Error('Missing absolute file path')
  const fullPath = path.resolve(decoded)
  if (!fullPath.startsWith('/data/')) throw new Error('File path must be inside /data')
  const stat = await fs.promises.stat(fullPath)
  if (!stat.isFile()) throw new Error('Path is not a file')
  return { fullPath, stat }
}

async function serveDataFile(req, res, rawPath, forceDownload = false) {
  const { fullPath, stat } = await resolveDataFile(rawPath)
  const ext = path.extname(fullPath)
  const name = path.basename(fullPath)
  const disposition = forceDownload ? 'attachment' : 'inline'
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': `${disposition}; filename="${encodeURIComponent(name)}"`,
  })
  fs.createReadStream(fullPath).pipe(res)
}

function fileUrl(filePath, download = false) {
  return `/data-file?path=${encodeURIComponent(filePath)}${download ? '&download=1' : ''}`
}

function isInsideData(value) {
  return typeof value === 'string' && path.resolve(value).startsWith('/data/')
}

function addDownloadRoot(roots, candidate, label = 'history') {
  if (!candidate || !isInsideData(candidate)) return
  roots.set(path.resolve(candidate).replace(/\/+$/, ''), label)
}

function expectedFilesFromHistory(history) {
  const expected = new Map()
  for (const share of Object.values(history.shares || {})) {
    for (const file of [...(share.expectedFiles || []), ...(share.files || []), ...(share.missingFiles || [])]) {
      if (file.path && isInsideData(file.path)) {
        const fullPath = path.resolve(file.path)
        expected.set(fullPath, {
          name: file.name || path.basename(fullPath),
          path: fullPath,
          size: file.size || 0,
          source: share.name || share.driveId || 'history',
        })
      }
    }
  }
  for (const event of history.events || []) {
    for (const file of [...(event.expectedFiles || []), ...(event.files || []), ...(event.missingFiles || [])]) {
      if (file.path && isInsideData(file.path)) {
        const fullPath = path.resolve(file.path)
        expected.set(fullPath, {
          name: file.name || path.basename(fullPath),
          path: fullPath,
          size: file.size || 0,
          source: event.name || event.driveId || event.type || 'history',
        })
      }
    }
  }
  return [...expected.values()]
}

async function listDownloadedFiles(settings, history) {
  const roots = new Map()
  addDownloadRoot(roots, settings.downloadDir, 'current setting')
  for (const share of Object.values(history.shares || {})) {
    addDownloadRoot(roots, share.downloadPath, share.name || 'history')
    for (const file of share.files || []) {
      if (file.path && isInsideData(file.path)) addDownloadRoot(roots, path.dirname(file.path), share.name || 'history file')
    }
  }
  for (const event of history.events || []) {
    addDownloadRoot(roots, event.downloadPath, event.name || event.type || 'history event')
    for (const file of event.files || []) {
      if (file.path && isInsideData(file.path)) addDownloadRoot(roots, path.dirname(file.path), event.name || event.type || 'history file')
    }
  }

  const byPath = new Map()
  for (const root of roots.keys()) {
    for (const file of await listFilesRecursive(root)) {
      byPath.set(file.path, file)
    }
  }

  const files = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  const expectedFiles = expectedFilesFromHistory(history)
  const missingFiles = []
  for (const expected of expectedFiles) {
    try {
      const stat = await fs.promises.stat(expected.path)
      if (!stat.isFile()) missingFiles.push({ ...expected, reason: 'path exists but is not a regular file' })
    } catch {
      missingFiles.push({ ...expected, reason: 'not found on disk' })
    }
  }

  return {
    downloadDir: settings.downloadDir,
    downloadDirs: [...roots.entries()].map(([path, source]) => ({ path, source })),
    files,
    expectedFiles,
    missingFiles,
    totalBytes: files.reduce((sum, f) => sum + f.size, 0),
  }
}

function renderDownloadGallery(downloadDir, files, options = {}) {
  const { downloadDirs = [], expectedFiles = [], missingFiles = [] } = options
  const cards = files.length ? files.map(file => {
    const ext = path.extname(file.path).toLowerCase()
    const viewHref = fileUrl(file.path)
    const downloadHref = fileUrl(file.path, true)
    let preview = '<div class="preview generic">File</div>'
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      preview = `<img class="preview" src="${viewHref}" alt="${escapeHtml(file.relativePath)}">`
    } else if (['.mp4', '.webm', '.mov'].includes(ext)) {
      preview = `<video class="preview" src="${viewHref}" controls preload="metadata"></video>`
    } else if (['.mp3', '.wav', '.ogg'].includes(ext)) {
      preview = `<audio class="preview audio" src="${viewHref}" controls></audio>`
    } else if (ext === '.pdf') {
      preview = `<iframe class="preview" src="${viewHref}"></iframe>`
    } else if (ext === '.txt') {
      preview = `<iframe class="preview" src="${viewHref}"></iframe>`
    }
    return `<article class="card">
      ${preview}
      <h2>${escapeHtml(file.relativePath || file.name)}</h2>
      <p>${escapeHtml(file.path)}</p>
      <div class="actions"><a href="${viewHref}" target="_blank">View</a><a href="${downloadHref}">Download</a></div>
    </article>`
  }).join('\n') : '<p class="empty">No downloaded files found.</p>'

  const rootList = downloadDirs.length
    ? `<section class="notice"><h2>Scanned download locations</h2><ul>${downloadDirs.map(root => `<li><code>${escapeHtml(root.path)}</code> <span>${escapeHtml(root.source || '')}</span></li>`).join('')}</ul></section>`
    : ''
  const missingList = missingFiles.length
    ? `<section class="notice warning"><h2>Expected but missing from disk</h2><p>PearDrop history says these were in the share/download, but they are not present at the recorded paths.</p><ul>${missingFiles.map(file => `<li><code>${escapeHtml(file.path)}</code> — ${escapeHtml(file.reason || 'missing')}</li>`).join('')}</ul></section>`
    : ''

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>PearDrop Downloads</title>
  <style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e5e7eb}header{padding:24px;background:#111827;border-bottom:1px solid #334155}main{padding:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}.notice{margin:16px 20px;padding:14px;border-radius:14px;background:#111827;border:1px solid #334155}.notice.warning{border-color:#f97316;background:#1c1917}.notice ul{margin:8px 0 0;padding-left:20px}.notice li{margin:6px 0;word-break:break-all}.notice code{color:#bae6fd}.notice span{color:#94a3b8}.card{background:#111827;border:1px solid #334155;border-radius:14px;padding:14px;overflow:hidden}.preview{width:100%;height:220px;object-fit:contain;background:#020617;border-radius:10px;border:1px solid #1f2937}.preview.audio{height:54px}.generic{display:flex;align-items:center;justify-content:center;font-size:32px;color:#94a3b8}h1{margin:0 0 8px}h2{font-size:16px;word-break:break-word}p{color:#94a3b8;word-break:break-all;font-size:13px}.actions{display:flex;gap:10px;margin-top:12px}.actions a{flex:1;text-align:center;padding:10px;border-radius:10px;background:#2563eb;color:white;text-decoration:none}.actions a:nth-child(2){background:#16a34a}.empty{padding:24px}</style>
  </head><body><header><h1>PearDrop Downloads</h1><p>Current setting: ${escapeHtml(downloadDir)}</p><p>Found ${files.length} file(s). History expected ${expectedFiles.length} file(s).</p></header>${rootList}${missingList}<main>${cards}</main></body></html>`
}

// Route handler
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname
  const method = req.method

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  try {
    // === API Routes ===
    
    // GET /api/status - Get overall status
    if (method === 'GET' && pathname === '/api/status') {
      const status = manager.getStatus()
      const history = await readHistory()
      json(res, { success: true, ...status, history: history.totals })
      return
    }

    // GET /api/history - Get access/share history
    if (method === 'GET' && pathname === '/api/history') {
      const history = await readHistory()
      json(res, { success: true, ...history })
      return
    }

    // GET /api/settings - Get user-editable settings
    if (method === 'GET' && pathname === '/api/settings') {
      const settings = await readSettings()
      json(res, { success: true, ...settings })
      return
    }

    // POST /api/settings - Update user-editable settings
    if (method === 'POST' && pathname === '/api/settings') {
      let body = ''
      await new Promise((resolve) => {
        req.on('data', c => body += c)
        req.on('end', resolve)
      })
      const settings = await writeSettings(JSON.parse(body))
      json(res, { success: true, ...settings })
      return
    }
    
    // GET /api/downloads/list - List downloaded files in the configured save location
    if (method === 'GET' && pathname === '/api/downloads/list') {
      const settings = await readSettings()
      const history = await readHistory()
      const data = await listDownloadedFiles(settings, history)
      json(res, { success: true, ...data })
      return
    }

    // POST /api/downloads/copy - Copy downloaded files to another /data path
    if (method === 'POST' && pathname === '/api/downloads/copy') {
      let body = ''
      await new Promise((resolve) => {
        req.on('data', c => body += c)
        req.on('end', resolve)
      })
      const { destination } = JSON.parse(body || '{}')
      const settings = await readSettings()
      const dest = normalizeDataPath(destination, '/data/exported-downloads')
      if (dest === settings.downloadDir || dest.startsWith(settings.downloadDir + '/')) {
        throw new Error('Destination must not be inside the current download directory')
      }
      await fs.promises.mkdir(dest, { recursive: true })
      await fs.promises.cp(settings.downloadDir, dest, { recursive: true, force: true })
      const files = await listFilesRecursive(dest)
      json(res, { success: true, source: settings.downloadDir, destination: dest, files, totalBytes: files.reduce((sum, f) => sum + f.size, 0) })
      return
    }

    // POST /api/downloads/export - Create a tar.gz bundle under /data/exports
    if (method === 'POST' && pathname === '/api/downloads/export') {
      const settings = await readSettings()
      const exportsDir = '/data/exports'
      await fs.promises.mkdir(exportsDir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const outputFile = path.join(exportsDir, `peardrop-downloads-${stamp}.tar.gz`)
      await tarGz(settings.downloadDir, outputFile)
      const stat = await fs.promises.stat(outputFile)
      json(res, { success: true, source: settings.downloadDir, archivePath: outputFile, size: stat.size, modifiedAt: stat.mtime.toISOString() })
      return
    }
    
    // GET /api/shares - List active shares
    if (method === 'GET' && pathname === '/api/shares') {
      const status = manager.getStatus()
      json(res, { success: true, shares: status.active })
      return
    }
    
    // POST /api/share - Share files (multipart upload)
    if (method === 'POST' && pathname === '/api/share') {
      const files = await parseMultipart(req)
      
      if (files.length === 0) {
        json(res, { success: false, error: 'No files uploaded' }, 400)
        return
      }
      
      // Save uploaded files to disk first, then share
      const shareFiles = []
      for (const f of files) {
        const filePath = path.join(UPLOADS_DIR, f.filename)
        await fs.promises.writeFile(filePath, f.data)
        shareFiles.push({
          name: f.filename,
          path: filePath,
          size: f.size
        })
      }
      
      const shareName = files.length === 1 ? files[0].filename : null
      const result = await manager.createDrive(shareFiles, { name: shareName })

      await recordEvent('share-created', {
        driveId: result.driveId,
        shareLink: result.shareLink,
        name: shareName || `${shareFiles.length} files`,
        files: shareFiles.map(f => ({ name: f.name, size: f.size, path: f.path })),
        totalBytes: shareFiles.reduce((sum, f) => sum + f.size, 0),
      })
      
      json(res, {
        success: true,
        driveId: result.driveId,
        shareLink: result.shareLink,
        files: shareFiles.map(f => ({ name: f.name, size: f.size }))
      })
      return
    }
    
    // POST /api/download - Download from a share link
    if (method === 'POST' && pathname === '/api/download') {
      let body = ''
      await new Promise((resolve) => {
        req.on('data', c => body += c)
        req.on('end', resolve)
      })
      
      const { link } = JSON.parse(body)
      if (!link) {
        json(res, { success: false, error: 'No link provided' }, 400)
        return
      }

      await recordEvent('download-started', { shareLink: link })
      
      const result = await manager.openDrive(link)
      const settings = await readSettings()
      const downloadResult = await downloadFromDrive(result.drive, {
        destDir: settings.downloadDir,
        totalBytes: result.totalBytes,
        shareName: result.shareName,
      })
      const downloadPath = downloadResult.destDir
      const downloadedFiles = downloadResult.files
      const missingFiles = downloadResult.failed.map(file => ({
        name: path.basename(file.key),
        sourcePath: file.key,
        path: path.join(downloadPath, String(file.key).replace(/^\/+/, '')),
        reason: file.error,
      }))
      const partial = missingFiles.length > 0

      await recordEvent(partial ? 'download-partial' : 'download-complete', {
        driveId: result.driveId,
        shareLink: link,
        name: result.shareName || 'Downloaded share',
        files: downloadedFiles,
        missingFiles,
        expectedFiles: result.files.map(f => {
          const name = f.displayName || f.name
          const relativePath = String(f.name || name).replace(/^\/+/, '')
          return { name, size: f.size || 0, sourcePath: f.name, path: path.join(downloadPath, relativePath) }
        }),
        totalBytes: downloadedFiles.reduce((sum, f) => sum + (f.size || 0), 0),
        expectedBytes: result.totalBytes || result.files.reduce((sum, f) => sum + (f.size || 0), 0),
        downloadPath,
      })
      
      json(res, {
        success: true,
        partial,
        driveId: result.driveId,
        files: downloadedFiles,
        missingFiles,
        expectedCount: result.files.length,
        downloadPath,
        shareName: result.shareName
      })
      
      // Clean up receiving session
      await result.close()
      return
    }
    
    // DELETE /api/shares/:id - Stop a share
    if (method === 'DELETE' && pathname.startsWith('/api/shares/')) {
      const driveId = pathname.replace('/api/shares/', '')
      await manager.stopDrive(driveId, { delete: true })
      json(res, { success: true })
      return
    }
    
    // DELETE /api/shares - Stop all shares
    if (method === 'DELETE' && pathname === '/api/shares') {
      await manager.stopAll({ delete: true })
      json(res, { success: true })
      return
    }
    
    // GET /downloads - Browser gallery for downloaded media/files
    if (method === 'GET' && pathname === '/downloads') {
      const settings = await readSettings()
      const history = await readHistory()
      const data = await listDownloadedFiles(settings, history)
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(renderDownloadGallery(settings.downloadDir, data.files, data))
      return
    }

    // GET /data-file?path=/data/... - View/download a file from the package data volume
    if (method === 'GET' && pathname === '/data-file') {
      await serveDataFile(req, res, url.searchParams.get('path'), url.searchParams.get('download') === '1')
      return
    }
    
    // === Static Files ===
    if (method === 'GET') {
      let filePath = pathname === '/' ? '/index.html' : pathname
      const fullPath = path.join(__dirname, 'web', filePath)
      
      try {
        const data = await fs.promises.readFile(fullPath)
        const ext = path.extname(fullPath)
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(data)
      } catch {
        res.writeHead(404)
        res.end('Not found')
      }
      return
    }
    
    res.writeHead(404)
    res.end('Not found')
    
  } catch (err) {
    console.error('[WebUI] Error:', err.message)
    json(res, { success: false, error: err.message }, 500)
  }
}

// Start server
async function main() {
  await ensureDirs()
  await manager.init()

  manager.on('peer-connected', (data) => {
    recordEvent('peer-connected', data).catch(err => console.error('[History] peer-connected:', err.message))
  })

  manager.on('peer-disconnected', (data) => {
    recordEvent('peer-disconnected', data).catch(err => console.error('[History] peer-disconnected:', err.message))
  })

  manager.on('upload-complete', (data) => {
    recordEvent('upload-complete', data).catch(err => console.error('[History] upload-complete:', err.message))
  })
  
  const server = http.createServer(handleRequest)
  
  server.listen(PORT, () => {
    console.log(`[WebUI] PearDrop Web UI running on http://0.0.0.0:${PORT}`)
  })
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[WebUI] Shutting down...')
    server.close()
    await manager.stopAll({ delete: false })
    process.exit(0)
  })
  
  process.on('SIGINT', async () => {
    console.log('[WebUI] Interrupted, shutting down...')
    server.close()
    await manager.stopAll({ delete: false })
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[WebUI] Fatal error:', err)
  process.exit(1)
})
