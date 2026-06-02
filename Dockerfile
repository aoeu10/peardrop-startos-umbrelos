ARG CACHEBUST=1
FROM node:20-bookworm-slim

WORKDIR /opt/peardrop

COPY peardrop-src/ ./

RUN npm install --omit=dev && \
    npm cache clean --force && \
    ln -s /opt/peardrop/bin/peardrop /usr/local/bin/peardrop

# Create version-suffixed copies for require-addon compatibility
RUN echo "Creating version-suffixed prebuilds..." && \
    cd /opt/peardrop/node_modules/rocksdb-native/prebuilds/linux-x64 && \
    ls -la && \
    cp -v rocksdb-native.node rocksdb-native@3.15.1.node && \
    cd /opt/peardrop/node_modules/sodium-native/prebuilds/linux-x64 && \
    ls -la && \
    cp -v sodium-native.node sodium-native@4.2.1.node && \
    echo "Done creating prebuilds"

ENV HOME=/data

ENTRYPOINT ["node", "bin/peardrop"]
CMD ["serve"]
