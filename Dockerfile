# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache build-base python3 curl

COPY package.json bun.lock ./
RUN npm install

COPY src/ ./src/
RUN npx --yes esbuild src/index.js \
    --bundle --platform=node --format=esm --outfile=dist/index.js \
    --packages=external

FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache ffmpeg yt-dlp

COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/node_modules/ ./node_modules/

ENV NODE_ENV=production
ENV YTDLP_PATH=/usr/bin/yt-dlp
CMD ["node", "dist/index.js"]
