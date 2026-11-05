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
      command: ['node', 'web-host/dist/server.cjs'],
      env: {
        HOME: '/data',
        PEARDROP_HOME: '/data/.peardrop',
        PEARDROP_PORT: '47931',
      },
    },
    ready: {
      display: i18n('P2P Service'),
      fn: () =>
        sdk.healthCheck.checkPortListening(effects, 47931, {
          successMessage: i18n('PearDrop is running'),
          errorMessage: i18n('PearDrop is not responding'),
        }),
    },
    requires: [],
  })
})
