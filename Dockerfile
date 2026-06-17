# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache build-base python3 curl

COPY package.json bun.lock ./
RUN npm install

COPY src/ ./src/
RUN npx --yes esbuild src/index.js \
    --bundle --platform=node --format=esm --outfile=dist/index.js \
    --external:dotenv \
    --external:ffmpeg-static \
    --external:@snazzah/davey \
    --external:@snazzah/davey-linux-x64-musl \
    --external:@snazzah/davey-linux-x64-gnu \
    --external:better-sqlite3 \
    --external:sodium-native \
    --external:opusscript

RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
    -o dist/yt-dlp && chmod +x dist/yt-dlp

FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/node_modules/ ./node_modules/

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
