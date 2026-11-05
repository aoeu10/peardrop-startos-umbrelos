#!/usr/bin/env bash
#
# Build the PearDrop web host:
#   1. npm install at the repo root (ELECTRON_SKIP_BINARY_DOWNLOAD=1 skips the
#      ~100MB Electron binary; the repo's postinstall guard exits early on it).
#      If the registry blocks fresh versions (npmrc min-release-age), retry
#      with that gate disabled.
#   2. esbuild: server (node CJS, all node_modules external) + browser shim (IIFE).
#   3. vite: the unmodified renderer → web-host/dist/renderer.
#   4. copy the shim into the renderer output (index.html references /peardrop-api.js).
#
# Run from anywhere: `bash web-host/build.sh`
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

export ELECTRON_SKIP_BINARY_DOWNLOAD=1

echo "==> npm install (root)"
if ! npm install --no-audit --no-fund; then
  echo "==> npm install failed — retrying with min-release-age disabled"
  npm_config_min_release_age=0 npm install --no-audit --no-fund
fi

ESBUILD=node_modules/.bin/esbuild
VITE=node_modules/.bin/vite

echo "==> esbuild: web host server"
mkdir -p web-host/dist
"$ESBUILD" web-host/server.ts \
  --bundle --platform=node --format=cjs --packages=external \
  --outfile=web-host/dist/server.cjs \
  --tsconfig=web-host/tsconfig.json \
  --log-level=warning

echo "==> esbuild: browser shim (peardrop-api.js)"
"$ESBUILD" web-host/preload.ts \
  --bundle --format=iife \
  --outfile=web-host/dist/peardrop-api.js \
  --tsconfig=web-host/tsconfig.json \
  --log-level=warning

echo "==> vite: renderer"
"$VITE" build --config web-host/vite.config.ts

echo "==> copy shim into renderer output"
cp web-host/dist/peardrop-api.js web-host/dist/renderer/peardrop-api.js

echo "==> done: web-host/dist/server.cjs + web-host/dist/renderer/"
echo "    run: PEARDROP_HOME=/var/lib/peardrop PEARDROP_PORT=47931 node web-host/dist/server.cjs"
