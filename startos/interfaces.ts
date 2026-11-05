import { sdk } from './sdk'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const uiHost = sdk.MultiHost.of(effects, 'ui')
  const uiOrigin = await uiHost.bindPort(47931, {
    protocol: 'http',
    preferredExternalPort: 47931,
  })

  const ui = sdk.createInterface(effects, {
    name: 'Web UI',
    id: 'ui',
    description: 'PearDrop P2P File Sharing web interface',
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  return [await uiOrigin.export([ui])]
})
