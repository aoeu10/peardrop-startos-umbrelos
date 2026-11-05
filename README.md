# PearDrop packaging — StartOS & umbrelOS

Community server packages for [PearDrop](https://github.com/peardrive/peardrop-desktop)
— simple, elegant peer-to-peer file sharing. No accounts, no cloud, no size
limits. Drop a file in, send the `peardrop://` link, and it goes straight from
your server to theirs.

This repo holds the same web build (the real PearDrop React UI served by a
headless P2P engine — no Electron) packaged for two platforms:

| Folder | Platform | Status |
| --- | --- | --- |
| [`startos/`](startos/) | StartOS 0.4 (Start9) | Released — [s9pk v1.1.0:0](https://github.com/aoeu10/peardrop-startos-umbrelos/releases) and verified working with other peers |
| [`peardrop/`](peardrop/) | umbrelOS 2.0 (community app store) | This repo is added directly as a community store; package lives in the top-level `peardrop/` directory |

Both packages ship the same image sources; the umbrelOS package pulls the
prebuilt multi-arch image `ghcr.io/aoeu10/peardrop:0.29.0` (amd64 + arm64,
digest-pinned), while the StartOS package builds it from `startos/`.

## Install on umbrelOS

1. Open your umbrelOS dashboard → **App Store** → **…** → **Add Community App
   Store**.
2. Enter this repo: `aoeu10/peardrop-startos-umbrelos`
3. Install **PearDrop** from the new store listing and open it from the home
   screen.

## Install on StartOS

Download the `.s9pk` from the releases page and side-load it through the
StartOS marketplace, or use the package repo directly.

## Credits

PearDrop is MIT-licensed, © 2026 Anjou
([upstream](https://github.com/peardrive/peardrop-desktop)). The packaging in
this repo is MIT as well.
