import { i18n } from './i18n'
import { sdk } from './sdk'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting PearDrop P2P File Sharing'))

  const peardropContainer = await sdk.SubContainer.of(
    effects,
    { imageId: 'peardrop' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: '/data',
      readonly: false,
    }),
    'peardrop',
  )

  return sdk.Daemons.of(effects).addDaemon('primary', {
    subcontainer: peardropContainer,
    exec: {
      command: ['node', 'bin/peardrop', 'serve'],
      env: {
        HOME: '/data',
      },
    },
    ready: {
      display: i18n('P2P Service'),
      fn: () =>
        new Promise((resolve) => {
          // PearDrop serve mode just runs - no port to check
          // Consider it ready after a short delay
          setTimeout(() => {
            resolve({
              result: 'success' as const,
              message: i18n('PearDrop is running'),
            })
          }, 2000)
        }),
    },
    requires: [],
  })
})
