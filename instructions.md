# PearDrop on StartOS

PearDrop is a simple P2P file sharing service. Share files and get a `peardrop://` link — anyone with the link can download directly from you.

## How to Use

PearDrop runs headlessly on StartOS. Use the **Actions** in the StartOS UI to:

- **Share Files**: Select a file or folder to share. PearDrop generates a `peardrop://` link you can send to anyone.
- **Download Files**: Paste a `peardrop://` link to download shared files.
- **List Shares**: See all your active shares with their links.
- **Service Status**: View statistics (shares created, bytes transferred, etc.)

## File Access

Shared files must be placed in the PearDrop data directory. Use the StartOS file manager to upload files, or connect via SSH.

Downloaded files are saved to `/data/downloads/` inside the container.

## How It Works

- Uses **Hyperdrive** for decentralized P2P transfers
- No accounts, no servers, no tracking
- Files transfer directly between peers
- The service must be running for shares to be accessible
- Shares can be resumed after restart using the "serve" mode

## Data

All PearDrop data (active shares, downloads, config) is stored in the `main` volume and included in backups.
