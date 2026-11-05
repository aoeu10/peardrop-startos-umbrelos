import { sdk } from '../sdk'
import * as fs from 'fs/promises'
import * as path from 'path'

/**
 * Actions for the PearDrop 0.29 web build (upstream peardrive/peardrop-desktop).
 *
 * The new engine keeps no aggregate history file; everything the actions show
 * comes from two sources:
 *   - the engine's HTTP API (GET /api/status on the service port), and
 *   - the /data volume itself (downloads + daily engine logs).
 */

const DOWNLOAD_DIRS = [
  '/data/.peardrop/downloads',
  '/media/startos/volumes/main/.peardrop/downloads',
]

const LOG_DIRS = [
  '/data/.peardrop/logs',
  '/media/startos/volumes/main/.peardrop/logs',
]

type DownloadFile = {
  name: string
  relativePath: string
  path: string
  size: number
  modifiedAt?: string
}

function fmtBytes(bytes = 0): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx++
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`
}

function fmtDate(value?: string | null): string {
  if (!value) return 'Unknown'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

/** Collect regular files under a directory (recursive), newest-modified first. */
async function scanFiles(root: string): Promise<DownloadFile[]> {
  const out: DownloadFile[] = []
  async function walk(dir: string) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const st = await fs.stat(full)
        out.push({
          name: entry.name,
          relativePath: path.relative(root, full),
          path: full,
          size: st.size,
          modifiedAt: st.mtime.toISOString(),
        })
      } catch {}
    }
  }
  await walk(root)
  return out.sort((a, b) =>
    String(b.modifiedAt).localeCompare(String(a.modifiedAt)),
  )
}

/** First download directory that exists on this volume, if any. */
async function findDownloadRoot(): Promise<string | null> {
  for (const dir of DOWNLOAD_DIRS) {
    try {
      const st = await fs.stat(dir)
      if (st.isDirectory()) return dir
    } catch {}
  }
  return null
}

// ── Engine status ─────────────────────────────────────────────────────────

type EngineStatusResponse = {
  ok?: boolean
  phase?: string
  backend?: string
  backendLabel?: string
  bootstrap?: string[]
  bootstrapSource?: string
  startedAt?: number | null
  error?: string | null
  stats?: { drives?: number; active?: number }
  peers?: number
  connections?: number
  bytesIn?: number
  bytesOut?: number
}

export const engineStatus = sdk.Action.withoutInput(
  'engine-status',
  async () => ({
    name: 'PearDrop Engine Status',
    description:
      'Show the P2P engine phase, DHT bootstrap nodes, network counters, and drive counts.',
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),
  async () => {
    let status: EngineStatusResponse | null = null
    try {
      const res = await fetch('http://127.0.0.1:47931/api/status')
      if (res.ok) status = (await res.json()) as EngineStatusResponse
    } catch {}

    if (!status) {
      return {
        version: '1' as const,
        title: 'PearDrop Engine Status',
        message:
          'Could not reach the PearDrop engine API on port 47931. The service may be stopped, or still starting up. Try again once the service shows as running.',
        result: {
          type: 'single' as const,
          value: 'Engine API unreachable',
          copyable: false,
          qr: false,
          masked: false,
        },
      }
    }

    const startedAt = status.startedAt
      ? fmtDate(new Date(status.startedAt).toISOString())
      : 'Not started yet'

    return {
      version: '1' as const,
      title: 'PearDrop Engine Status',
      message: status.error
        ? `The engine reported an error: ${status.error}`
        : `Engine phase: ${status.phase || 'unknown'}`,
      result: {
        type: 'group' as const,
        value: [
          {
            name: 'Phase',
            description: null,
            type: 'single' as const,
            value: status.phase || 'unknown',
            copyable: false,
            qr: false,
            masked: false,
          },
          {
            name: 'Backend',
            description: null,
            type: 'single' as const,
            value: status.backendLabel || status.backend || 'unknown',
            copyable: false,
            qr: false,
            masked: false,
          },
          {
            name: 'Drives',
            description:
              'Total drives known to the engine (shares + downloads).',
            type: 'single' as const,
            value: String(status.stats?.drives ?? 0),
            copyable: false,
            qr: false,
            masked: false,
          },
          {
            name: 'Active Drives',
            description: 'Drives currently announcing or transferring.',
            type: 'single' as const,
            value: String(status.stats?.active ?? 0),
            copyable: false,
            qr: false,
            masked: false,
          },
          {
            name: 'Bootstrap Nodes',
            description:
              'DHT nodes the engine uses to find peers (empty means the public DHT).',
            type: 'single' as const,
            value:
              status.bootstrap && status.bootstrap.length
                ? status.bootstrap.join(', ')
                : 'Public DHT',
            copyable: true,
            qr: false,
            masked: false,
          },
          {
            name: 'Bootstrap Source',
            description: null,
            type: 'single' as const,
            value: status.bootstrapSource || 'public',
            copyable: false,
            qr: false,
            masked: false,
          },
          {
            name: 'Peers',
            description: 'Peers currently connected.',
            type: 'single' as const,
            value: String(status.peers ?? 0),
            copyable: false,
            qr: false,
            masked: false,
          },
          {
            name: 'Bytes In / Out',
            description: null,
            type: 'single' as const,
            value: `${fmtBytes(status.bytesIn ?? 0)} in / ${fmtBytes(status.bytesOut ?? 0)} out`,
            copyable: false,
            qr: false,
            masked: false,
          },
          {
            name: 'Started At',
            description: null,
            type: 'single' as const,
            value: startedAt,
            copyable: false,
            qr: false,
            masked: false,
          },
        ],
      },
    }
  },
)

// ── Downloads ─────────────────────────────────────────────────────────────

const copyDownloadsSpec = sdk.InputSpec.of({
  destination: sdk.Value.text({
    name: 'Destination Path',
    description:
      'Absolute path inside /data where downloaded files should be copied.',
    warning:
      'If the destination already contains files with the same names, they may be overwritten.',
    footnote:
      'Use a path inside /data so the copied files persist in the package data volume, e.g. /data/exported-downloads.',
    default: '/data/exported-downloads',
    required: true,
    placeholder: '/data/exported-downloads',
    patterns: [
      {
        regex: '^/data(/.*)?$',
        description: 'Must be an absolute path inside /data',
      },
    ],
  }),
})

export const viewDownloadedFiles = sdk.Action.withoutInput(
  'view-downloaded-files',
  async () => ({
    name: 'PearDrop Downloaded Files',
    description:
      'Show files saved in PearDrop’s download folder (/data/.peardrop/downloads), with sizes and paths.',
    warning: null,
    allowedStatuses: 'any',
    group: 'Downloads',
    visibility: 'enabled',
  }),
  async () => {
    const root = await findDownloadRoot()
    const files = root ? await scanFiles(root) : []
    const total = files.reduce((sum, file) => sum + file.size, 0)
    const groups = files.slice(0, 25).map((file) => ({
      name: file.relativePath,
      description: `${fmtBytes(file.size)} — modified ${fmtDate(file.modifiedAt)}`,
      type: 'group' as const,
      value: [
        {
          name: 'Path',
          description: 'Path inside the package data volume.',
          type: 'single' as const,
          value: file.path,
          copyable: true,
          qr: false,
          masked: false,
        },
        {
          name: 'Size',
          description: null,
          type: 'single' as const,
          value: fmtBytes(file.size),
          copyable: false,
          qr: false,
          masked: false,
        },
        {
          name: 'Modified',
          description: null,
          type: 'single' as const,
          value: fmtDate(file.modifiedAt),
          copyable: false,
          qr: false,
          masked: false,
        },
      ],
    }))

    return {
      version: '1' as const,
      title: 'PearDrop Downloaded Files',
      message: root
        ? `Download folder: ${root}\nFound on disk: ${files.length} file(s), ${fmtBytes(total)} total${files.length > 25 ? '\nShowing the 25 most recent files.' : ''}`
        : 'No download folder exists yet. Download a file through the PearDrop Web UI first.',
      result: {
        type: 'group' as const,
        value: [
          {
            name: 'Download Folder',
            description: null,
            type: 'single' as const,
            value: root || DOWNLOAD_DIRS[0],
            copyable: true,
            qr: false,
            masked: false,
          },
          {
            name: 'Total Size',
            description: null,
            type: 'single' as const,
            value: fmtBytes(total),
            copyable: false,
            qr: false,
            masked: false,
          },
          ...groups,
        ],
      },
    }
  },
)

export const copyDownloadedFiles = sdk.Action.withInput(
  'copy-downloaded-files',
  async () => ({
    name: 'PearDrop Copy Downloaded Files',
    description:
      'Copy downloaded files to another folder inside /data so they are easier to reach from the package data volume.',
    warning:
      'If the destination already contains files with the same names, they may be overwritten.',
    allowedStatuses: 'only-running',
    group: 'Downloads',
    visibility: 'enabled',
  }),
  copyDownloadsSpec,
  async () => ({ destination: '/data/exported-downloads' }),
  async ({ input }) => {
    const destination = input.destination.trim()
    if (!destination.startsWith('/data/')) {
      throw new Error('Destination must be an absolute path inside /data')
    }
    const root = await findDownloadRoot()
    if (!root) {
      throw new Error(
        'No download folder found. Download a file through the PearDrop Web UI first.',
      )
    }
    const files = await scanFiles(root)
    if (!files.length) {
      throw new Error(
        'The download folder is empty. Download a file through the PearDrop Web UI first.',
      )
    }

    let copied = 0
    let bytes = 0
    for (const file of files) {
      const target = path.join(destination, file.relativePath)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.copyFile(file.path, target)
      copied++
      bytes += file.size
    }

    return {
      version: '1' as const,
      title: 'PearDrop Downloads Copied',
      message: `Copied ${copied} file(s) (${fmtBytes(bytes)}) from ${root} to ${destination}.`,
      result: {
        type: 'single' as const,
        value: files
          .slice(0, 25)
          .map(
            (file) =>
              `${file.relativePath} → ${path.join(destination, file.relativePath)}`,
          )
          .join('\n'),
        copyable: true,
        qr: false,
        masked: false,
      },
    }
  },
)

// ── Engine logs ───────────────────────────────────────────────────────────

export const recentEngineLogs = sdk.Action.withoutInput(
  'recent-engine-logs',
  async () => ({
    name: 'PearDrop Recent Engine Logs',
    description:
      'Show the most recent lines from the newest PearDrop engine log (kept under /data/.peardrop/logs).',
    warning: null,
    allowedStatuses: 'any',
    group: 'Diagnostics',
    visibility: 'enabled',
  }),
  async () => {
    let lines: string[] = []
    let source: string | null = null
    for (const dir of LOG_DIRS) {
      let entries
      try {
        entries = await fs.readdir(dir)
      } catch {
        continue
      }
      const logs = entries
        .filter((name) => name.endsWith('.log'))
        .sort()
        .reverse()
      for (const name of logs) {
        const full = path.join(dir, name)
        try {
          const raw = await fs.readFile(full, 'utf8')
          lines = raw.trimEnd().split('\n').slice(-60)
          source = full
          break
        } catch {}
      }
      if (source) break
    }

    return {
      version: '1' as const,
      title: 'PearDrop Recent Engine Logs',
      message: source
        ? `Showing the last ${lines.length} line(s) of ${source}.`
        : 'No engine logs found yet. Logs are written to /data/.peardrop/logs once the engine runs.',
      result: {
        type: 'single' as const,
        value: lines.length ? lines.join('\n') : 'No log lines available.',
        copyable: true,
        qr: false,
        masked: false,
      },
    }
  },
)

export const actions = sdk.Actions.of()
  .addAction(engineStatus)
  .addAction(viewDownloadedFiles)
  .addAction(copyDownloadedFiles)
  .addAction(recentEngineLogs)
