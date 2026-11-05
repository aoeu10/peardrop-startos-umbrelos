# PearDrop for StartOS — headless web host for upstream peardrive/peardrop-desktop.
#
# The web-host bundle (web-host/dist/server.cjs), the browser API shim
# (web-host/dist/peardrop-api.js) and the built React renderer
# (web-host/dist/renderer) are pure arch-independent JS/HTML/CSS produced on
# the HOST by upstream-desktop/web-host/build.sh. This image therefore only
# installs the engine's runtime dependencies — npm fetches the native addon
# prebuilds (sodium/udx/rocksdb) for the TARGET architecture — and no JS
# bundling happens inside the build, keeping x86_64 builds under QEMU fast.
#
# Do not remove ELECTRON_SKIP_BINARY_DOWNLOAD: the upstream postinstall
# script would otherwise pull the ~100 MB Electron binary we never run.

FROM node:20-bookworm-slim

# libatomic.so.1 needed by rocksdb-native, libstdc++6 for other native addons
RUN apt-get update && \
    apt-get install -y --no-install-recommends libatomic1 libstdc++6 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt/peardrop

# Runtime dependency manifest from upstream (lockfile pins exact versions).
COPY upstream-desktop/package.json upstream-desktop/package-lock.json ./

# Host-built bundles: server + browser shim + renderer assets.
COPY upstream-desktop/web-host/dist ./web-host/dist
# App logo, read from cwd by web-host (About dialog / app:info.iconDataUrl).
COPY upstream-desktop/assets/icons/logo.png ./assets/icons/logo.png

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# Fail the build fast if the native P2P addons cannot load in the target arch.
RUN node -e "require('sodium-native')" && \
    node -e "require('rocksdb-native')" && \
    echo "native addons OK"

ENV HOME=/data \
    PEARDROP_HOME=/data/.peardrop \
    PEARDROP_PORT=47931

EXPOSE 47931

ENTRYPOINT ["node", "web-host/dist/server.cjs"]
