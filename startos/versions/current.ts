import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.18.0:1',
  releaseNotes: {
    en_US: 'Initial PearDrop package for StartOS. P2P file sharing via Hyperdrive with peardrop:// links.',
    es_ES: 'Paquete inicial de PearDrop para StartOS.',
    de_DE: 'Initiales PearDrop-Paket für StartOS.',
    pl_PL: 'Początkowy pakiet PearDrop dla StartOS.',
    fr_FR: 'Package initial de PearDrop pour StartOS.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
