/**
 * Persistent access/share history for the StartOS Web UI wrapper.
 * Keeps a compact JSON event log under /data/peardrop/access-history.json.
 */

const fs = require('fs').promises
const path = require('path')
const os = require('os')

const HISTORY_DIR = path.join(os.homedir(), 'peardrop')
const HISTORY_FILE = path.join(HISTORY_DIR, 'access-history.json')
const MAX_EVENTS = 500

const emptyHistory = () => ({
  version: 1,
  shares: {},
  events: [],
  totals: {
    sharesCreated: 0,
    peerConnections: 0,
    peerDisconnections: 0,
    uploadCompletes: 0,
    downloadsStarted: 0,
    downloadsCompleted: 0,
    bytesUploaded: 0,
    bytesDownloaded: 0,
  },
})

async function readHistory() {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf8')
    return { ...emptyHistory(), ...JSON.parse(data) }
  } catch {
    return emptyHistory()
  }
}

async function writeHistory(history) {
  await fs.mkdir(HISTORY_DIR, { recursive: true })
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2))
}

function safeShare(history, driveId) {
  if (!history.shares[driveId]) {
    history.shares[driveId] = {
      driveId,
      name: 'Unknown share',
      shareLink: null,
      files: [],
      missingFiles: [],
      expectedFiles: [],
      totalBytes: 0,
      createdAt: null,
      lastAccessedAt: null,
      peerConnections: 0,
      uploadCompletes: 0,
      bytesUploaded: 0,
    }
  }
  return history.shares[driveId]
}

async function recordEvent(type, data = {}) {
  const history = await readHistory()
  const now = new Date().toISOString()
  const event = { ts: now, type, ...data }

  history.events.unshift(event)
  history.events = history.events.slice(0, MAX_EVENTS)

  const driveId = data.driveId
  if (driveId) {
    const share = safeShare(history, driveId)
    if (data.name) share.name = data.name
    if (data.shareLink) share.shareLink = data.shareLink
    if (Array.isArray(data.files)) share.files = data.files
    if (Array.isArray(data.missingFiles)) share.missingFiles = data.missingFiles
    if (Array.isArray(data.expectedFiles)) share.expectedFiles = data.expectedFiles
    if (typeof data.totalBytes === 'number') share.totalBytes = data.totalBytes
    if (data.downloadPath) share.downloadPath = data.downloadPath
  }

  switch (type) {
    case 'share-created': {
      history.totals.sharesCreated++
      const share = safeShare(history, driveId)
      share.createdAt = now
      share.name = data.name || share.name
      share.shareLink = data.shareLink || share.shareLink
      share.files = data.files || share.files
      share.totalBytes = data.totalBytes || share.totalBytes
      break
    }
    case 'peer-connected': {
      history.totals.peerConnections++
      const share = safeShare(history, driveId)
      share.peerConnections++
      share.lastAccessedAt = now
      break
    }
    case 'peer-disconnected': {
      history.totals.peerDisconnections++
      break
    }
    case 'upload-complete': {
      history.totals.uploadCompletes++
      history.totals.bytesUploaded += data.totalBytes || 0
      const share = safeShare(history, driveId)
      share.uploadCompletes++
      share.bytesUploaded += data.totalBytes || 0
      share.lastAccessedAt = now
      break
    }
    case 'download-started': {
      history.totals.downloadsStarted++
      break
    }
    case 'download-complete': {
      history.totals.downloadsCompleted++
      history.totals.bytesDownloaded += data.totalBytes || 0
      break
    }
    case 'download-partial': {
      history.totals.downloadsCompleted++
      history.totals.bytesDownloaded += data.totalBytes || 0
      break
    }
  }

  await writeHistory(history)
  return history
}

module.exports = {
  HISTORY_FILE,
  readHistory,
  recordEvent,
}
