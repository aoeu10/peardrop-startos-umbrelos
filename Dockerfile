FROM node:20-bookworm-slim

# Install PearDrop CLI and dependencies
WORKDIR /opt/peardrop

# Copy the PearDrop source from the zip
COPY peardrop-src/ ./

RUN npm install --omit=dev --ignore-scripts && \
    npm cache clean --force && \
    ln -s /opt/peardrop/bin/peardrop /usr/local/bin/peardrop

# Data directory for shares and downloads
ENV PEARDROP_HOME=/data

# Run in serve mode by default (resumes shares, keeps running)
ENTRYPOINT ["node", "bin/peardrop"]
CMD ["serve"]
