export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting PearDrop P2P File Sharing': 0,
  'P2P Service': 1,
  'PearDrop is running': 2,
  'PearDrop is not responding': 3,

  // actions
  'Share Files': 4,
  'Share files from the data directory via P2P': 5,
  'Path to file or folder to share (relative to /data)': 6,
  'Download Files': 7,
  'Download files from a peardrop:// link': 8,
  'The peardrop:// link to download from': 9,
  'Download destination (relative to /data)': 10,
  'List Shares': 11,
  'List all active P2P shares': 12,
  'Service Status': 13,
  'Show PearDrop statistics and active shares': 14,
} as const

export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
