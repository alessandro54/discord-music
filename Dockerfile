# syntax=docker/dockerfile:1

FROM denoland/deno:debian
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
       -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

COPY deno.json deno.lock ./
RUN deno install --allow-scripts \
    && deno eval "import '@db/sqlite'" 2>/dev/null || true

COPY src/ ./src/

ENV NODE_ENV=production \
    YTDLP_PATH=/usr/local/bin/yt-dlp

CMD ["deno", "run", "--allow-all", "--cached-only", "src/index.js"]
