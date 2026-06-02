import { sdk } from './sdk'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  // PearDrop is a headless P2P service
  // No web UI or fixed network interface to expose
  // Sharing happens via peardrop:// links over hyperswarm
  return []
})
