# PearDrop for umbrelOS

[![Get PearDrop on umbrelOS](https://apps.umbrel.com/badge-dark.svg)](https://apps.umbrel.com)

A community [umbrelOS](https://github.com/getumbrel/umbrel) app package for
[PearDrop](https://github.com/peardrive/peardrop-desktop) — simple, elegant
peer-to-peer file sharing. No accounts, no cloud, no size limits. Drop a file
in, send the `peardrop://` link, and it goes straight from your Umbrel to
theirs.

This repo is a standalone [community app store](https://github.com/getumbrel/umbrel-apps):
each top-level directory is an app package. It currently contains:

- `peardrop/` — the PearDrop app package (umbrelOS 2.0 compatible)

## What the package runs

The package serves the **real PearDrop desktop app** in your browser: the
unmodified React interface (library, share/receive, themes) built with Vite
and served by a headless engine host over HTTP. No Electron runs on the
server; the P2P engine (Hyperdrive/Hyperswarm) runs in the same Node process.

- Image: `ghcr.io/aoeu10/peardrop:0.29.0`, multi-arch (`linux/amd64` +
  `linux/arm64`), pinned by digest in `docker-compose.yml`
- Source: built from `peardrive/peardrop-desktop` v0.29.0 (commit
  `d29911e2c6a3aad51986f241ed4e5c388c3a7196`) with a web host bridge that
  implements the desktop IPC surface over WebSocket
  (see [aoeu10/peardrop-startos](https://github.com/aoeu10/peardrop-startos)
  for the full packaging source and the StartOS 0.4 package)
- Persistence: everything lives under the app's data folder
  (`data/peardrop` → `/data/.peardrop` in the container), so downloads,
  shares, and settings survive restarts and updates and are included in
  Umbrel backups
- Networking: browser UI is routed through Umbrel's `app_proxy` with Umbrel
  auth enabled; the P2P engine connects out to the public Hyperswarm DHT and
  accepts inbound peer connections over the container network (no raw host
  ports needed for the UI)

## Install on umbrelOS

1. Open your umbrelOS dashboard → **App Store** → **…** (menu) →
   **Add Community App Store** / **Add Store**.
2. Enter this repo: `aoeu10/peardrop-startos-umbrelos`
3. Install **PearDrop** from the new store listing.
4. Open it from the Umbrel home screen, share a file, and send the link.

## Testing status

- Package structure validated against the official
  [umbrel-apps packaging guide](https://github.com/getumbrel/umbrel-apps)
  (`manifestVersion: 1`, `storage.dataRoot: data`, `app_proxy` routing,
  digest-pinned multi-arch image, `${APP_DATA_DIR}/data` bind mounts)
- Image smoke-tested from the pinned digest: UI serves on the declared port,
  engine reaches `ready` on the public DHT, and data persists to the mounted
  data folder with correct ownership as `1000:1000`
- Not yet runtime-tested through the umbrelOS app lifecycle on a real device

## License

PearDrop is MIT-licensed, © 2026 Anjou
([upstream](https://github.com/peardrive/peardrop-desktop)). The packaging in
this repo is MIT as well.
