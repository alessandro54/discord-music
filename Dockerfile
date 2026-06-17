# syntax=docker/dockerfile:1

# Build stage: uses bun image (has bash + bun)
FROM oven/bun:1-alpine AS build
WORKDIR /app

RUN apk add --no-cache build-base python3 curl nodejs npm

COPY package.json bun.lock ./
# npm for native module compilation (real node-gyp)
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

RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
    -o dist/yt-dlp && chmod +x dist/yt-dlp

# Runtime stage: lean node alpine
FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/node_modules/ ./node_modules/

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
