# PearDrop on StartOS

PearDrop is a simple peer-to-peer file sharing service packaged for StartOS. It uses Hyperdrive/Hyperswarm to share files directly between peers using `peardrop://` links.

This package serves the real PearDrop desktop app ([peardrive/peardrop-desktop](https://github.com/peardrive/peardrop-desktop)) in the browser: the unmodified React renderer is built with Vite and served over HTTP, and the P2P engine runs headlessly in the same Node process behind a WebSocket bridge that implements the desktop app's `window.peardrop` API. No Electron runs on the server.

## Versioning

- StartOS package version: `1.1.0:0`
- Bundled upstream PearDrop desktop version: `0.29.0`
- Bundled upstream commit: `d29911e2c6a3aad51986f241ed4e5c388c3a7196` (vendored under `upstream-desktop/`)

The StartOS package version is intentionally separate from the upstream PearDrop application version. Package updates may include StartOS-specific changes such as the web-host bridge, Actions, port/interface changes, packaging fixes, or runtime library fixes even when the bundled PearDrop app version stays the same.

## How the web port works

```
browser ──HTTP──▶ web-host (Node, port 47931)
   │  static: built React renderer (web-host/dist/renderer)
   │  POST /web-upload: picked files → /data/.peardrop/web-uploads
   │  GET /api/status: engine status JSON (used by StartOS Actions)
   └──WebSocket─▶ invoke(channel) / push(channel)  ==  Electron IPC surface
                     │
                     ▼
              EngineHost → hyperdrive/hyperswarm backend
```

- `web-host/server.ts` — headless host: reuses the upstream engine, stores and services; implements every IPC channel from `src/shared/ipc.ts` without Electron.
- `web-host/preload.ts` — browser shim installed as `window.peardrop` before the renderer boots; files picked in the browser are uploaded via `/web-upload` and shared from the server.
- `upstream-desktop/web-host/build.sh` — builds host bundle (esbuild), browser shim (esbuild), and renderer (Vite).

## Image and Container Runtime

- Image: built from `node:20-bookworm-slim`
- Architectures: `x86_64`, `aarch64`
- Command: `node web-host/dist/server.cjs`
- Runtime libraries: `libatomic1`, `libstdc++6` for native Node addons (`rocksdb-native`, `sodium-native`)

## Volume and Data Layout

- Volume: `main`
- Mount point: `/data`
- Persistent paths:
  - `/data/.peardrop/` — engine data root (drives, downloads, preferences, library, logs)
  - `/data/.peardrop/downloads/` — files received through `peardrop://` links
  - `/data/.peardrop/web-uploads/` — files picked in the browser before sharing
  - `/data/.peardrop/logs/` — daily engine logs, last 14 days

Upgrading from package `1.0.0:7`: the engine migrates the old `/data/peardrop/` layout to `/data/.peardrop/` automatically on first launch.

## Network Access and Interfaces

- Interface: Web UI
- Internal port: `47931`
- Protocol: HTTP
- Purpose: the PearDrop app interface for sharing files, downloading from `peardrop://` links, and managing the drive library

StartOS exports the Web UI through the normal service interface system, so users should open PearDrop from the StartOS service page or through `start-tunnel` rather than connecting directly to container port 47931.

## Installation and First-Run Flow

No configuration is required. Install, start the service, then open the Web UI.

On first start, PearDrop connects to the public Hyperswarm DHT by itself. A custom bootstrap node can be set in **Settings → Network**.

## StartOS Actions

- **PearDrop Engine Status** — engine phase, backend, bootstrap nodes, peers, bytes in/out, drive counts.
- **PearDrop Downloaded Files** — recursive listing of the download folder with sizes and paths.
- **PearDrop Copy Downloaded Files** — copy downloads to another `/data` folder such as `/data/exported-downloads`.
- **PearDrop Recent Engine Logs** — last lines of the newest daily engine log.

## Health Checks

The primary daemon is healthy when port `47931` is listening.

- Success message: `PearDrop is running`
- Error message: `PearDrop is not responding`

## Dependencies

No StartOS service dependencies.

## Backups and Restore

The `main` volume is included in backups. This preserves PearDrop data, uploads, downloads, and transfer state.

## Limitations and Differences from Upstream

- Upstream is an Electron desktop app; here the engine runs headless and the UI is served over HTTP with the exact same renderer code.
- Files picked in the browser are uploaded to the server (`web-uploads/`) before sharing; folder picking is not supported.
- Opening/revealing files in the OS file manager is unavailable in the browser; download files to your device through the browser instead.
- Shares require the service to stay running for recipients to download.
- Transfers depend on peer availability and DHT connectivity.

## Quick Reference

```yaml
package_id: peardrop
package_version: 1.1.0:0
upstream_peardrop_version: 0.29.0
upstream: https://github.com/peardrive/peardrop-desktop
architectures: [x86_64, aarch64]
volumes:
  main: /data
ports:
  web_ui: 47931/http
dependencies: none
entrypoint: node web-host/dist/server.cjs
```
