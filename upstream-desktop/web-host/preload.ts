/**
 * Browser shim for window.peardrop — a drop-in PeardropApi implementation
 * (see src/shared/ipc.ts) that talks to web-host/server.ts over a WebSocket.
 *
 * Bundled as an IIFE and loaded by a plain <script> tag BEFORE the renderer
 * module, so src/renderer/main.tsx finds window.peardrop and uses the real
 * backend instead of its mock client.
 *
 * Protocol (server side in web-host/server.ts):
 *   → {id, channel, args}   invoke;  ← {id, ok:true, result} | {id, ok:false, error}
 *   → {subscribe: ch} / {unsubscribe: ch};  ← {push: ch, payload}
 *
 * Local-file flows:
 *   files.pick()    native <input type=file multiple>, opened synchronously
 *                   inside the user gesture; each file is POSTed to
 *                   /web-upload and the returned server paths are resolved.
 *   pathForFile(f)  synchronous (renderer contract) — registers the File
 *                   under a synthetic "webfile:" path; the wrapper uploads
 *                   lazily when the renderer stats those paths via files:stat.
 */
import type {
  IpcArgs,
  IpcChannel,
  IpcPushChannel,
  IpcPushMap,
  IpcResult,
  PeardropApi
} from '@shared/ipc'

type Unsubscribe = () => void

// ── WebSocket transport with reconnect, queued invokes and re-subscribe ──

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; channel: IpcChannel; args: unknown[] }

class Rpc {
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private queue: Pending[] = []
  private listeners = new Map<IpcPushChannel, Set<(payload: any) => void>>()
  private attempts = 0
  private closed = false

  constructor() {
    this.connect()
  }

  private connect(): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    let ws: WebSocket
    try {
      ws = new WebSocket(`${proto}//${location.host}`)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    ws.onopen = () => {
      this.attempts = 0
      // Re-subscribe every channel the page is still listening to.
      for (const channel of this.listeners.keys()) this.rawSend({ subscribe: channel })
      // Flush invokes queued while offline, in order.
      const queued = this.queue
      this.queue = []
      for (const p of queued) this.dispatch(p)
    }
    ws.onmessage = (ev) => {
      let msg: any
      try {
        msg = JSON.parse(String(ev.data))
      } catch {
        return
      }
      if (msg && msg.push) {
        for (const cb of this.listeners.get(msg.push as IpcPushChannel) ?? []) cb(msg.payload)
        return
      }
      if (msg && typeof msg.id === 'number') {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        if (msg.ok) p.resolve(msg.result)
        else p.reject(new Error(String(msg.error ?? 'Unknown error')))
      }
    }
    ws.onclose = () => {
      this.ws = null
      // Fail nothing yet: queued invokes replay after reconnect. Only a page
      // unload drops them.
      this.scheduleReconnect()
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* onclose follows */
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return
    const delay = Math.min(500 * 2 ** this.attempts++, 10_000)
    setTimeout(() => {
      if (!this.closed && !this.ws) this.connect()
    }, delay)
  }

  private rawSend(payload: unknown): boolean {
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload))
        return true
      } catch {
        return false
      }
    }
    return false
  }

  private dispatch(p: Pending): void {
    const id = this.nextId++
    this.pending.set(id, p)
    if (!this.rawSend({ id, channel: p.channel, args: p.args })) {
      this.pending.delete(id)
      this.queue.push(p)
    }
  }

  invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>> {
    return new Promise<IpcResult<C>>((resolve, reject) => {
      const p: Pending = { resolve, reject, channel, args }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.dispatch(p)
      else this.queue.push(p)
    })
  }

  subscribe<C extends IpcPushChannel>(channel: C, cb: (payload: IpcPushMap[C]) => void): Unsubscribe {
    let set = this.listeners.get(channel)
    const first = !set
    if (!set) {
      set = new Set()
      this.listeners.set(channel, set)
    }
    set.add(cb)
    if (first) this.rawSend({ subscribe: channel })
    return () => {
      const s = this.listeners.get(channel)
      if (!s) return
      s.delete(cb)
      if (s.size === 0) {
        this.listeners.delete(channel)
        this.rawSend({ unsubscribe: channel })
      }
    }
  }
}

const rpc = new Rpc()

// ── local file upload plumbing ───────────────────────────────────────────

async function uploadFile(file: File): Promise<string> {
  const res = await fetch(`/web-upload?name=${encodeURIComponent(file.name || 'file')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file
  })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  const data = (await res.json()) as { path: string }
  return data.path
}

/**
 * Synthetic path registry for dropped/pasted DOM Files. pathForFile must be
 * synchronous (the renderer's contract), so Files get placeholder paths here
 * and are uploaded when the renderer asks main to stat them.
 */
const webFiles = new Map<string, File>()
let webFileCounter = 0

function isWebPath(p: string): boolean {
  return typeof p === 'string' && p.startsWith('webfile:')
}

/** Resolve any synthetic paths in a files:stat / files:exists argument list to real server paths. */
async function resolveWebPaths(paths: string[]): Promise<string[]> {
  const out: string[] = []
  for (const p of paths ?? []) {
    if (isWebPath(p)) {
      const file = webFiles.get(p)
      if (!file) {
        out.push(p)
        continue
      }
      try {
        out.push(await uploadFile(file))
        webFiles.delete(p) // uploaded once; the server path is now authoritative
      } catch (err) {
        webFiles.delete(p)
        out.push(p) // stat will then report it missing, like a deleted desktop file
      }
    } else {
      out.push(p)
    }
  }
  return out
}

/** Wrap invoke so files:stat / files:exists see real server paths. */
const rawInvoke = rpc.invoke.bind(rpc)
rpc.invoke = (async (channel: IpcChannel, ...args: any[]) => {
  if ((channel === 'files:stat' || channel === 'files:exists') && Array.isArray(args[0])) {
    const resolved = await resolveWebPaths(args[0] as string[])
    return rawInvoke(channel, ...( [resolved, ...args.slice(1)] as any))
  }
  return rawInvoke(channel, ...(args as any))
}) as typeof rpc.invoke

// ── the API surface (mirrors src/preload/index.ts) ───────────────────────

const api: PeardropApi = {
  transfers: {
    snapshot: () => rpc.invoke('transfers:snapshot'),
    share: (req) => rpc.invoke('transfers:share', req),
    cancelShare: (id) => rpc.invoke('transfers:cancel-share', id),
    checkLink: (link) => rpc.invoke('transfers:check-link', link),
    open: (link, opts) => rpc.invoke('transfers:open', link, opts),
    download: (req) => rpc.invoke('transfers:download', req),
    cancelDownload: (id) => rpc.invoke('transfers:cancel-download', id),
    get: (id) => rpc.invoke('transfers:get', id),
    pause: (id) => rpc.invoke('transfers:pause', id),
    resume: (id) => rpc.invoke('transfers:resume', id),
    remove: (id, opts) => rpc.invoke('transfers:remove', id, opts),
    onEvent: (cb) => rpc.subscribe('transfers:event', cb)
  },
  files: {
    stat: (paths) => rpc.invoke('files:stat', paths),
    exists: (paths) => rpc.invoke('files:exists', paths),
    open: () => Promise.resolve({ success: false, error: 'Opening files locally is not available in the web UI' }),
    reveal: () => Promise.resolve({ success: false, error: 'Revealing files is not available in the web UI' }),
    openDownloads: () => Promise.resolve({ success: false, error: 'Opening the downloads folder is not available in the web UI' }),
    thumbnail: (p) => rpc.invoke('files:thumbnail', p),
    pick: () =>
      // Must open the input synchronously inside the click that called pick(),
      // before any await, or the browser strips the user gesture.
      new Promise<string[]>((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.style.display = 'none'
        input.addEventListener('change', () => {
          const files = Array.from(input.files ?? [])
          input.remove()
          if (!files.length) {
            resolve([])
            return
          }
          Promise.all(files.map(uploadFile))
            .then(resolve, reject)
            .finally(() => input.remove())
        })
        document.body.appendChild(input)
        input.click()
      }),
    pathForFile: (file: File): string => {
      const id = `webfile:${++webFileCounter}:${file.name || 'file'}`
      webFiles.set(id, file)
      return id
    }
  },
  receive: {
    list: () => rpc.invoke('receive:list'),
    add: (link) => rpc.invoke('receive:add', link),
    remove: (id) => rpc.invoke('receive:remove', id),
    retry: (id) => rpc.invoke('receive:retry', id),
    onChange: (cb) => rpc.subscribe('receive:changed', cb)
  },
  network: {
    stats: () => rpc.invoke('network:stats'),
    onStats: (cb) => rpc.subscribe('network:stats', cb)
  },
  window: {
    state: () => rpc.invoke('window:state'),
    act: (action) => rpc.invoke('window:action', action),
    onState: (cb) => rpc.subscribe('window:state', cb),
    setChrome: (chrome) => rpc.invoke('window:set-chrome', chrome)
  },
  qr: { generate: (text) => rpc.invoke('qr:generate', text) },
  app: {
    info: () => rpc.invoke('app:info'),
    onCommand: (cb) => rpc.subscribe('app:command', cb) // never pushed by the web host
  },
  settings: {
    get: () => rpc.invoke('settings:get'),
    update: (patch) => rpc.invoke('settings:update', patch),
    onChange: (cb) => rpc.subscribe('settings:changed', cb)
  },
  library: {
    get: () => rpc.invoke('library:get'),
    setFavorite: (id, fav) => rpc.invoke('library:set-favorite', id, fav),
    setAlias: (id, alias) => rpc.invoke('library:set-alias', id, alias),
    forget: (id) => rpc.invoke('library:forget', id),
    import: (data) => rpc.invoke('library:import', data)
  },
  engine: {
    status: () => rpc.invoke('engine:status'),
    reload: (req) => rpc.invoke('engine:reload', req),
    onStatus: (cb) => rpc.subscribe('engine:status', cb)
  },
  logs: {
    path: () => rpc.invoke('logs:path'),
    reveal: () => rpc.invoke('logs:reveal'),
    tail: (lines) => rpc.invoke('logs:tail', lines),
    write: (entry) => rpc.invoke('logs:write', entry)
  }
}

;(window as unknown as { peardrop?: PeardropApi }).peardrop = api
