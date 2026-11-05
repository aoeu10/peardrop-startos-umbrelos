/** Persistent settings for PearDrop StartOS wrapper. */

const fs = require('fs').promises
const path = require('path')
const os = require('os')

const SETTINGS_DIR = path.join(os.homedir(), 'peardrop')
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json')
const DEFAULT_DOWNLOAD_DIR = path.join(os.homedir(), 'downloads')

function defaults() {
  return {
    version: 1,
    downloadDir: DEFAULT_DOWNLOAD_DIR,
  }
}

function normalizeDownloadDir(value) {
  const dir = String(value || '').trim()
  if (!dir) return DEFAULT_DOWNLOAD_DIR
  if (!path.isAbsolute(dir)) throw new Error('Download location must be an absolute path, for example /data/downloads')
  if (!dir.startsWith('/data/')) throw new Error('Download location must be inside /data so StartOS can persist it')
  return dir.replace(/\/+$/, '') || '/data'
}

async function readSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8')
    return { ...defaults(), ...JSON.parse(raw) }
  } catch {
    return defaults()
  }
}

async function writeSettings(settings) {
  const next = {
    ...defaults(),
    ...settings,
    downloadDir: normalizeDownloadDir(settings.downloadDir),
  }
  await fs.mkdir(SETTINGS_DIR, { recursive: true })
  await fs.mkdir(next.downloadDir, { recursive: true })
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2))
  return next
}

module.exports = {
  SETTINGS_FILE,
  DEFAULT_DOWNLOAD_DIR,
  normalizeDownloadDir,
  readSettings,
  writeSettings,
}
