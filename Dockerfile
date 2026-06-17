# syntax=docker/dockerfile:1
FROM node:20-slim AS base
WORKDIR /app

# Build stage: compile native modules + bundle with bun
FROM base AS build
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential pkg-config python3-is-python curl && \
    rm -rf /var/lib/apt/lists/*

# Install bun for bundling
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

COPY package.json bun.lock ./
# npm for native module compilation (real node-gyp), bun for speed on pure-JS deps
RUN npm install

COPY src/ ./src/
RUN bun build src/index.js --target=node --format=esm --outfile=dist/index.js \
    --external @discordjs/opus \
    --external ffmpeg-static \
    --external @snazzah/davey \
    --external @snazzah/davey-linux-x64-musl \
    --external @snazzah/davey-linux-x64-gnu \
    --external better-sqlite3 \
    --external sodium-native

# Download yt-dlp binary
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
    -o dist/yt-dlp && chmod +x dist/yt-dlp

# Runtime stage: lean image
FROM base AS runtime
WORKDIR /app

COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/node_modules/ ./node_modules/

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
