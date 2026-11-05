/**
 * PearDrop web host — a headless, Electron-free re-implementation of the
 * desktop main process (src/main/peardrop-app.ts + src/main/ipc/register.ts).
 *
 * It runs the REAL engine (src/engine) and the REAL services (preferences,
 * library, receive queue, network monitor) in plain Node, serves the built
 * renderer from ./dist/renderer, and speaks the IPC contract
 * (src/shared/ipc.ts) over a WebSocket so the browser shim
 * (web-host/preload.ts → dist/peardrop-api.js) can expose window.peardrop.
 *
 * HTTP surface (same port as the WebSocket):
 *   GET  /                  static renderer (SPA fallback to index.html)
 *   POST /web-upload        raw body → <data root>/web-uploads/<ts>-<name>, {path}
 *   GET  /api/ping          {ok:true} — plain liveness probe for StartOS Actions
 *   GET  /api/status        EngineStatus + a cheap transfer snapshot summary
 *   GET  /api/files/download?path=<abs>   stream a file as a browser download
 *                            (directories stream as <name>.tar.gz)
 *   GET  /api/files/browse?path=<dir>     minimal HTML folder listing
 *                            (defaults to the downloads folder)
 *
 * Environment:
 *   PEARDROP_PORT     HTTP/WS port (default 47931)
 *   PEARDROP_HOME     data root override (paths.ts honours it)
 *   PEARDROP_PROFILE  profile name (isolates state under <home>/profiles/<name>)
 *   PEARDROP_BOOTSTRAP  DHT bootstrap override, same as the desktop app
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { WebSocketServer, type WebSocket } from 'ws'
import QRCode from 'qrcode'
import pkgJson from '../package.json'
import type { IpcChannel, IpcInvokeMap, IpcPushChannel, IpcPushMap } from '@shared/ipc'
import type { AppInfo } from '@shared/app-info'
import type { ShareResult } from '@shared/transfer'
import type { PeardropPaths } from '@engine/paths'
import { LEGACY_ROOT, resolvePeardropPaths } from '@engine/paths'
import { ShareCancelledError } from '@engine/backend'
import { EngineHost } from '@engine/engine-host'
import { identityJson } from './identity'
import { LogManager } from '../src/main/logger'
import { migrateLegacyData } from '../src/main/migration'
import { pathsExist, statPaths } from '../src/main/services/file-stats'
import { NetworkMonitor } from '../src/main/services/network-monitor'
import { ReceiveQueue } from '../src/main/services/receive-queue'
import { buildShareInput, EmptyShareError } from '../src/main/services/share-input'
import { LibraryStore } from '../src/main/stores/library-store'
import { PreferencesStore } from '../src/main/stores/preferences-store'
import { thumbnailFor } from './thumbnail'

// ── runtime config & paths ───────────────────────────────────────────────

const PORT = Number.parseInt(process.env.PEARDROP_PORT || '', 10) || 47931
const paths: PeardropPaths = resolvePeardropPaths({
  home: process.env.PEARDROP_HOME || undefined,
  profile: process.env.PEARDROP_PROFILE || null
})
const envBootstrap = (process.env.PEARDROP_BOOTSTRAP || '').trim() || null
const webUploadsDir = path.join(paths.root, 'web-uploads')

// ── logging (the desktop LogManager is Electron-free) ────────────────────

fs.mkdirSync(paths.root, { recursive: true })
const logs = new LogManager({ dir: paths.logsDir, retentionDays: 14 })
logs.init({
  app: identityJson.productName,
  version: pkgJson.version,
  platform: `${process.platform} ${process.arch}`,
  electron: 'none (web host)',
  profile: paths.profile ?? 'default',
  bootstrap: envBootstrap ?? 'preferences/public'
})
logs.mirrorConsole()
const log = logs.scope('web-host')

// ── one-time legacy migration, stores, engine ────────────────────────────

const migration = migrateLegacyData(paths, LEGACY_ROOT, log.child('migration'))
if (migration.migrated) log.info('Legacy data migrated', migration)

const prefs = new PreferencesStore(paths.preferencesFile, log.child('preferences'))
const library = new LibraryStore(paths.libraryFile, log.child('library'))

const engine = new EngineHost({
  paths,
  bootstrapSetting: {
    get: () => prefs.get().network.bootstrap,
    save: async (value) => {
      await prefs.patch({ network: { bootstrap: value } })
    }
  },
  log: logs.scope('engine'),
  envBootstrap
})

// The receive queue must subscribe before the engine starts, exactly like the desktop app.
const receiveQueue = new ReceiveQueue({ file: paths.receiveQueueFile, engine, log: logs.scope('receive-queue') })
const network = new NetworkMonitor(engine, () => true)

// ── IPC handlers (mirrors src/main/ipc/register.ts, Electron bits removed) ──

type Handler = (...args: any[]) => unknown
const handlers: { [C in IpcChannel]: Handler } = {
  // transfers (backend-neutral) — same error shaping as register.ts
  'transfers:snapshot': () => engine.withBackend((b) => b.snapshot()),
  'transfers:share': async (req): Promise<ShareResult> => {
    try {
      const input = buildShareInput(req.sources, { name: req.name, clientJobId: req.clientJobId })
      const out = await engine.withBackend((b) => b.createShare(input))
      return { success: true, driveId: out.driveId, shareLink: out.shareLink, files: out.files, record: out.record }
    } catch (err) {
      if (err instanceof ShareCancelledError) {
        log.info('Share cancelled by user')
        return { success: false, cancelled: true, error: 'Share cancelled' }
      }
      if (!(err instanceof EmptyShareError)) log.error('Share failed', err)
      return { success: false, error: (err as Error).message }
    }
  },
  'transfers:cancel-share': (id: string) => engine.withBackend((b) => ({ success: b.cancelShare(id) })),
  'transfers:check-link': (link: string) => engine.withBackend((b) => b.checkLink(link)),
  'transfers:open': (link: string, opts?: { force?: boolean }) => engine.withBackend((b) => b.open(link, opts)),
  'transfers:download': (req: unknown) => engine.withBackend((b) => b.download(req as any)),
  'transfers:cancel-download': (id: string) => engine.withBackend((b) => b.cancelDownload(id)),
  'transfers:get': (id: string) => engine.withBackend((b) => b.get(id)),
  'transfers:pause': (id: string) => engine.withBackend((b) => b.pause(id)),
  'transfers:resume': (id: string) => engine.withBackend((b) => b.resume(id)),
  'transfers:remove': (id: string, opts?: { deleteFiles?: boolean }) => engine.withBackend((b) => b.remove(id, opts)),

  // receive queue
  'receive:list': () => receiveQueue.list(),
  'receive:add': (link: string) => receiveQueue.add(link),
  'receive:remove': (id: string) => receiveQueue.remove(id),
  'receive:retry': (id?: string) => receiveQueue.retry(id),

  // local files — the browser uploads them via /web-upload, so they are real paths here
  'files:stat': (p: string[]) => statPaths(p, log),
  'files:exists': (p: string[]) => pathsExist(p),
  // "Open"/"reveal" download through the browser instead of shell.openPath;
  // the shim (preload.ts) turns a success result into /api/files/download or /browse.
  'files:open': async (p: string) => fileAccessResult(p),
  'files:reveal': async (p: string) => fileAccessResult(p),
  'files:open-downloads': () => ({ success: true }), // shim opens /api/files/browse for the downloads folder
  'files:thumbnail': (p: string) => thumbnailFor(p),
  'files:pick': () => [], // handled browser-side by the shim (native <input type=file> + upload)

  // misc
  'qr:generate': (text: string) => QRCode.toDataURL(text, { width: 320, margin: 1, color: { dark: '#000000', light: '#ffffff' } }),
  'app:info': (): AppInfo => ({
    identity: identityJson,
    version: pkgJson.version,
    platform: process.platform,
    arch: process.arch,
    windowFrame: 'native',
    versions: { electron: '', chrome: '', node: process.version },
    iconDataUrl: iconDataUrl(),
    isDev: false,
    profile: paths.profile,
    paths: { root: paths.root, downloads: paths.downloadsDir, logs: paths.logsDir, preferences: paths.preferencesFile }
  }),

  // settings & library
  'settings:get': () => prefs.get(),
  'settings:update': (patch: any) => prefs.patch(patch),
  'library:get': () => library.get(),
  'library:set-favorite': (id: string, fav: boolean) => library.setFavorite(id, fav),
  'library:set-alias': (id: string, alias: string | null) => library.setAlias(id, alias),
  'library:forget': (id: string) => library.forget(id),
  'library:import': (data: any) => library.importFrom(data),

  // engine
  'engine:status': () => engine.getStatus(),
  'engine:reload': (req?: { bootstrap?: string }) => engine.reload(req ?? {}),
  'network:stats': () => network.get(),

  // window controls — headless: the state is constant, actions are no-ops
  'window:state': () => ({ maximized: false, fullScreen: false, focused: true }),
  'window:action': () => ({ maximized: false, fullScreen: false, focused: true }),
  'window:set-chrome': () => undefined,

  // logs
  'logs:path': () => logs.currentFile(),
  'logs:reveal': () => ({ success: true }), // shim downloads the log file via /api/files/download
  'logs:tail': (lines?: number) => {
    try {
      return { success: true, text: logs.tail(Math.min(Math.max(lines ?? 300, 1), 5000)), path: logs.currentFile() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  },
  'logs:write': (entry: { level: any; scope: string; message: string; data?: unknown }) => {
    logs.write(entry.level, `ui:${entry.scope}`, entry.message, entry.data)
  }
}

/** The app icon as a data: URL (About section); best-effort. */
let cachedIcon: string | null | undefined
function iconDataUrl(): string | null {
  if (cachedIcon !== undefined) return cachedIcon
  cachedIcon = null
  const candidates = [
    path.join(__dirname, '..', '..', identityJson.icon), // web-host/dist/server.cjs → repo root
    path.join(process.cwd(), identityJson.icon)
  ]
  for (const p of candidates) {
    try {
      const buf = fs.readFileSync(p)
      cachedIcon = `data:image/png;base64,${buf.toString('base64')}`
      break
    } catch {
      /* try next candidate */
    }
  }
  return cachedIcon
}

// ── WebSocket RPC (the contract in src/shared/ipc.ts) ────────────────────

interface WsMessage {
  id?: number | string
  channel?: IpcChannel
  args?: unknown[]
  subscribe?: IpcPushChannel
  unsubscribe?: IpcPushChannel
}

const wss = new WebSocketServer({ noServer: true })
/** channel → subscribers, so pushes reach every connected client that asked for it. */
const subscriptions = new Map<WebSocket, Set<IpcPushChannel>>()

wss.on('connection', (ws: WebSocket) => {
  const subs = new Set<IpcPushChannel>()
  subscriptions.set(ws, subs)
  log.info('Web client connected', { clients: subscriptions.size })

  ws.on('message', (raw) => {
    let msg: WsMessage
    try {
      msg = JSON.parse(String(raw)) as WsMessage
    } catch {
      return
    }
    if (msg.subscribe) {
      subs.add(msg.subscribe)
      return
    }
    if (msg.unsubscribe) {
      subs.delete(msg.unsubscribe)
      return
    }
    if (typeof msg.id === 'number' || typeof msg.id === 'string') {
      const channel = msg.channel as IpcChannel
      const handler = handlers[channel] as Handler | undefined
      if (!handler) {
        send(ws, { id: msg.id, ok: false, error: `Unknown channel: ${channel}` })
        return
      }
      Promise.resolve()
        .then(() => handler(...(msg.args ?? [])))
        .then(
          (result) => send(ws, { id: msg.id, ok: true, result }),
          (err) => {
            log.error(`IPC ${channel} failed`, err)
            send(ws, { id: msg.id, ok: false, error: (err as Error)?.message ?? String(err) })
          }
        )
    }
  })

  ws.on('close', () => {
    subscriptions.delete(ws)
    log.info('Web client disconnected', { clients: subscriptions.size })
  })
  ws.on('error', () => subscriptions.delete(ws))
})

function send(ws: WebSocket, payload: unknown): void {
  try {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload))
  } catch {
    /* client vanished mid-write */
  }
}

function pushToClients<C extends IpcPushChannel>(channel: C, payload: IpcPushMap[C]): void {
  const frame = JSON.stringify({ push: channel, payload })
  for (const [ws, subs] of subscriptions) {
    if (subs.has(channel)) {
      try {
        if (ws.readyState === ws.OPEN) ws.send(frame)
      } catch {
        /* ignore */
      }
    }
  }
}

// Push wiring — identical channels/timing to src/main/peardrop-app.ts.
engine.on('event', (event) => pushToClients('transfers:event', event))
engine.on('status', (status) => pushToClients('engine:status', status))
receiveQueue.on('change', (tasks) => pushToClients('receive:changed', tasks))
network.on('stats', (stats) => pushToClients('network:stats', stats))
prefs.on('change', (next) => pushToClients('settings:changed', next))

// ── HTTP: static renderer, uploads, StartOS Actions endpoints ────────────

const RENDERER_DIR = path.join(__dirname, 'renderer')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json'
}

function serveFile(res: http.ServerResponse, file: string, status = 200): void {
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': fs.statSync(file).size })
  fs.createReadStream(file).pipe(res)
}

/** Keep only safe filename characters; the timestamp prefix prevents collisions. */
function sanitizeName(name: string): string {
  const base = path.basename(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
  return base.slice(-180) || 'file'
}

async function handleWebUpload(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const name = sanitizeName(url.searchParams.get('name') ?? 'file')
  await fs.promises.mkdir(webUploadsDir, { recursive: true })
  const target = path.join(webUploadsDir, `${Date.now()}-${name}`)
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(target)
    req.pipe(out)
    out.on('finish', () => resolve())
    out.on('error', reject)
    req.on('error', reject)
  })
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ path: target }))
  log.info('Web upload stored', { name, bytes: (fs.statSync(target).size) })
}

async function handleApiStatus(res: http.ServerResponse): Promise<void> {
  const status = engine.getStatus()
  let transfers: unknown = null
  try {
    // Cheap snapshot; if the engine is mid-start this resolves once it is ready.
    const snapshot = await Promise.race([
      engine.withBackend((b) => b.snapshot()),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
    ])
    if (snapshot) {
      transfers = {
        drives: snapshot.drives.length,
        uploads: snapshot.drives.filter((d) => d.isUpload).length,
        downloads: snapshot.drives.filter((d) => !d.isUpload).length,
        announced: snapshot.announced.length,
        resumeErrors: Object.keys(snapshot.resumeErrors ?? {}).length
      }
    }
  } catch {
    transfers = null
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ...status, transfers }))
}

// ── file download & folder browsing (web replacement for shell.openPath) ──
//
// Everything the UI could "open" lives under the engine's data roots: the data
// root itself (downloads, receive queue payloads), the downloads folder, and
// the /web-upload staging dir. Targets are realpath'd so a symlink inside the
// data folder cannot smuggle a path outside.

const DOWNLOAD_ROOTS = (): string[] => [paths.root, paths.downloadsDir, webUploadsDir]

async function resolveWithinRoots(rawPath: string): Promise<string | null> {
  if (!path.isAbsolute(rawPath)) return null
  let target = path.resolve(rawPath)
  try {
    target = await fs.promises.realpath(target)
  } catch {
    return null
  }
  const roots = await Promise.all(DOWNLOAD_ROOTS().map((r) => fs.promises.realpath(r).catch(() => r)))
  const inside = roots.some((root) => target === root || target.startsWith(root + path.sep))
  return inside ? target : null
}

// Shared result shape for files:open / files:reveal. `isDirectory` lets the
// shim pick browse-vs-download without a second round trip.
async function fileAccessResult(rawPath: string): Promise<{ success: boolean; isDirectory?: boolean; missing?: boolean; error?: string }> {
  try {
    const target = path.resolve(rawPath)
    const st = await fs.promises.stat(target)
    if (!(await resolveWithinRoots(rawPath))) {
      return { success: false, error: 'File access is limited to the PearDrop data folder in the web UI' }
    }
    return { success: true, isDirectory: st.isDirectory() }
  } catch {
    return { success: false, missing: true, error: 'File not found' }
  }
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  const utf8 = encodeURIComponent(filename).replace(/['()]/g, escape)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
}

async function handleFileDownload(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const target = await resolveWithinRoots(url.searchParams.get('path') ?? '')
  if (!target) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
    return
  }
  const name = path.basename(target)
  const st = await fs.promises.stat(target)
  if (st.isDirectory()) {
    // Folder "open" → stream the whole folder as a tar.gz (tar exists in the runtime image).
    res.writeHead(200, {
      'Content-Type': 'application/gzip',
      'Content-Disposition': contentDisposition(`${name}.tar.gz`)
    })
    const child = spawn('tar', ['-czf', '-', '-C', path.dirname(target), path.basename(target)], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stderr.on('data', (d: Buffer) => log.warn(`tar: ${d.toString().trim()}`))
    child.on('error', (err: Error) => {
      log.error('tar failed', err)
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    })
    child.stdout.pipe(res)
    return
  }
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': st.size,
    'Content-Disposition': contentDisposition(name)
  })
  fs.createReadStream(target).pipe(res)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function handleFolderBrowse(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const requested = url.searchParams.get('path') || paths.downloadsDir
  const dir = await resolveWithinRoots(requested)
  if (!dir) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
    return
  }
  const st = await fs.promises.stat(dir)
  if (!st.isDirectory()) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('Not a directory')
    return
  }
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
  const parent = path.dirname(dir)
  const parentLink =
    parent === dir || !(await resolveWithinRoots(parent))
      ? ''
      : `<li><a href="/api/files/browse?path=${encodeURIComponent(parent)}">../ (parent folder)</a></li>`
  const rows = entries
    .map((e) => {
      const full = path.join(dir, e.name)
      const label = escapeHtml(e.name) + (e.isDirectory() ? '/' : '')
      const href = e.isDirectory()
        ? `/api/files/browse?path=${encodeURIComponent(full)}`
        : `/api/files/download?path=${encodeURIComponent(full)}`
      const size = e.isDirectory() ? '' : 'download'
      return `<li><a href="${href}">${label}</a> ${size}</li>`
    })
    .join('\n')
  const html = `<!doctype html><meta charset="utf-8"><title>PearDrop — ${escapeHtml(path.basename(dir))}</title>
<h1>${escapeHtml(dir)}</h1><ul>${parentLink}${rows}</ul>
<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#141414;color:#eee}a{color:#7ab8f5;text-decoration:none}a:hover{text-decoration:underline}li{margin:.35rem 0}</style>`
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)

    if (req.method === 'POST' && pathname === '/web-upload') {
      await handleWebUpload(req, res)
      return
    }
    if (req.method === 'GET' && pathname === '/api/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (req.method === 'GET' && pathname === '/api/status') {
      await handleApiStatus(res)
      return
    }
    if (req.method === 'GET' && pathname === '/api/files/download') {
      await handleFileDownload(req, res)
      return
    }
    if (req.method === 'GET' && pathname === '/api/files/browse') {
      await handleFolderBrowse(req, res)
      return
    }

    // Static renderer with SPA fallback: real asset paths 404, app routes get index.html.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' })
      res.end('Method Not Allowed')
      return
    }
    const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '')
    let file = path.join(RENDERER_DIR, safe)
    if (!file.startsWith(RENDERER_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden')
      return
    }
    let indexFallback = false
    try {
      const st = fs.statSync(file)
      if (st.isDirectory()) {
        file = path.join(file, 'index.html')
        fs.statSync(file)
      }
    } catch {
      // Missing file: only an extensionless app route falls back to index.html.
      if (path.extname(safe) === '' || safe === '/') {
        file = path.join(RENDERER_DIR, 'index.html')
        indexFallback = true
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
        return
      }
    }
    serveFile(res, file)
  } catch (err) {
    log.error('HTTP request failed', err)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Internal Server Error')
  }
})

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

// ── boot (same order as PearDropApp.boot: stores → server → engine) ──────

server.listen(PORT, '0.0.0.0', () => {
  log.info(`Web host listening on http://0.0.0.0:${PORT}`, { root: paths.root, profile: paths.profile ?? 'default' })

  receiveQueue.start()
  network.start()

  // Started after the server is listening so the UI can show boot events live.
  log.info('Starting engine', { root: paths.root })
  engine
    .start()
    .then(() => log.info('Engine started'))
    .catch((err) => log.error('Engine failed to start (UI stays usable)', err))
})

// Graceful shutdown: stop the engine like the desktop quit path does (forced, no DHT goodbyes).
let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  log.info(`Received ${signal} — stopping engine`)
  network.stop()
  receiveQueue.stop()
  const done = () => {
    logs.flush()
    process.exit(0)
  }
  Promise.race([engine.stop({ force: true }), new Promise((r) => setTimeout(r, 8000))])
    .then(done)
    .catch(done)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
