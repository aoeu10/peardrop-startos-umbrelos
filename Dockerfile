FROM node:20-bookworm-slim

WORKDIR /opt/peardrop

COPY peardrop-src/ ./

RUN npm install --omit=dev && \
    npm cache clean --force && \
    ln -s /opt/peardrop/bin/peardrop /usr/local/bin/peardrop

ENV HOME=/data

ENTRYPOINT ["node", "bin/peardrop"]
CMD ["serve"]
