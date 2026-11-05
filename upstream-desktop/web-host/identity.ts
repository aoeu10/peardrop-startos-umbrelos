/**
 * App identity from app.config.json, without the Electron parts of
 * src/main/app-identity.ts (that file needs app/nativeImage for the icon,
 * which web-host/server.ts reads from disk itself).
 */
import identityJsonRaw from '../app.config.json'
import type { AppIdentity } from '@shared/app-info'

export const identityJson = identityJsonRaw as AppIdentity
