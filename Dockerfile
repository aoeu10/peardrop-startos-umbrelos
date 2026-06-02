FROM node:20-bookworm-slim

WORKDIR /opt/peardrop

COPY peardrop-src/ ./

RUN npm install --omit=dev && \
    npm cache clean --force && \
    ln -s /opt/peardrop/bin/peardrop /usr/local/bin/peardrop && \
    cd /opt/peardrop/node_modules/rocksdb-native/prebuilds/linux-x64 && \
    [ -f rocksdb-native.node ] && [ ! -f rocksdb-native@3.15.1.node ] && \
      ln -s rocksdb-native.node rocksdb-native@3.15.1.node || true && \
    cd /opt/peardrop/node_modules/sodium-native/prebuilds/linux-x64 && \
    [ -f sodium-native.node ] && [ ! -f sodium-native@3.15.1.node ] && \
      version=$(cat /opt/peardrop/node_modules/sodium-native/package.json | grep '"version"' | head -1 | sed 's/.*: "//;s/".*//') && \
      ln -s sodium-native.node "sodium-native@${version}.node" || true

ENV HOME=/data

ENTRYPOINT ["node", "bin/peardrop"]
CMD ["serve"]
