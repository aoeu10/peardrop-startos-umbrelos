# PearDrop on StartOS

PearDrop lets you share files directly with other people using peer-to-peer `peardrop://` links. Files transfer directly between peers; there is no central upload server.

This package serves the **real PearDrop desktop app** (upstream [peardrive/peardrop-desktop](https://github.com/peardrive/peardrop-desktop)) in your browser: the same React interface, themes, and drive library as the desktop releases, driven by the same P2P engine running headlessly on your server.

## Open the Web UI

After starting the service, open PearDrop from its StartOS service page using the **Web UI** interface.

## Share files

1. Click **Share** (the send icon) in the sidebar.
2. Pick files — the browser file picker uploads them to PearDrop's data folder on the server.
3. Copy the generated `peardrop://` link.
4. Send that link to the recipient.

Keep PearDrop running while recipients download. If the service is stopped, recipients cannot fetch the files until the share is running again (shares resume automatically on start).

## Download files

1. Paste a `peardrop://` link into the receive area (or just paste it anywhere in the app).
2. Files download directly from the peer to the server's download folder.
3. The **Library** view shows progress for every active transfer.

## Manage your library

The sidebar shows every drive (shares and downloads) with status, peers, and speed. From each drive's menu you can favorite it, rename it, pause/resume, or remove it. Settings offers Pear (dark) and Paper (light) themes, list/grid layout, and the DHT bootstrap node under **Settings → Network**.

## StartOS Actions

- **PearDrop Engine Status** — engine phase, DHT bootstrap nodes, peer counts, bytes in/out, and drive counts.
- **PearDrop Downloaded Files** — files saved in the download folder, with sizes and paths.
- **PearDrop Copy Downloaded Files** — copy downloads to another `/data` folder, such as `/data/exported-downloads`.
- **PearDrop Recent Engine Logs** — the latest lines from the engine's daily log.

## Data and backups

PearDrop stores everything in the `main` volume under `/data/.peardrop/`:

- `downloads/` — files you receive (files you share stay where they were uploaded)
- `drives/` — P2P drive data, one Corestore per drive
- `preferences.json`, `library.json`, `receive-queue.json` — settings and state
- `logs/` — daily engine logs, last 14 days

StartOS backups include this volume. If you are upgrading from a previous package version, your old data in `/data/peardrop/` is migrated to `/data/.peardrop/` automatically on first launch.

## Notes

- This package version `1.1.0:0` bundles the PearDrop desktop app `0.29.0` with a headless engine host; no Electron runs on the server.
- Sharing uses the browser file picker; each picked file is uploaded to the server first, then shared.
- Transfers depend on both peers being online and able to connect through the public Hyperswarm DHT (or a custom bootstrap node set in Settings → Network).
- For best results, leave PearDrop running until the recipient confirms the download completed.
