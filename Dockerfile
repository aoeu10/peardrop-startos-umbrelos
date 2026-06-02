FROM node:20-bookworm-slim

WORKDIR /opt/peardrop

COPY peardrop-src/ ./

RUN npm install --omit=dev && \
    npm cache clean --force && \
    ln -s /opt/peardrop/bin/peardrop /usr/local/bin/peardrop

# Create version-suffixed symlinks for require-addon compatibility
RUN cd /opt/peardrop/node_modules/rocksdb-native/prebuilds/linux-x64 && \
    [ -f rocksdb-native.node ] && \
    cp rocksdb-native.node rocksdb-native@3.15.1.node; \
    cd /opt/peardrop/node_modules/sodium-native/prebuilds/linux-x64 && \
    [ -f sodium-native.node ] && \
    cp sodium-native.node sodium-native@4.2.1.node; \
    cd /opt/peardrop/node_modules/udx-native/prebuilds/linux-x64 && \
    [ -f udx-native.node ] && \
    ver=$(node -e "console.log(require('/opt/peardrop/node_modules/udx-native/package.json').version)") && \
    cp udx-native.node "udx-native@${ver}.node"; \
    true

ENV HOME=/data

ENTRYPOINT ["node", "bin/peardrop"]
CMD ["serve"]
