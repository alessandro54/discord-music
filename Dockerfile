# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN npm install

COPY src/ ./src/
RUN npx --yes esbuild src/index.js \
    --bundle --platform=node --format=esm --outfile=dist/index.js \
    --packages=external

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
       -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/node_modules/ ./node_modules/

ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
CMD ["node", "dist/index.js"]
