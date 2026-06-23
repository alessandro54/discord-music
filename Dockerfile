# syntax=docker/dockerfile:1

FROM denoland/deno:debian
WORKDIR /app

# Set by buildx: amd64 | arm64. Pick the matching yt-dlp binary.
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates \
    && case "$TARGETARCH" in \
         arm64) YTDLP=yt-dlp_linux_aarch64 ;; \
         *)     YTDLP=yt-dlp_linux ;; \
       esac \
    && curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YTDLP" \
       -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

COPY deno.json deno.lock ./
RUN deno install --allow-scripts \
    && deno eval "import '@db/sqlite'" 2>/dev/null || true

COPY src/ ./src/

ENV NODE_ENV=production \
    YTDLP_PATH=/usr/local/bin/yt-dlp

# Dashboard HTTP port — Dokku maps proxy 80 → this and injects PORT
EXPOSE 3000

CMD ["deno", "run", "--allow-all", "--cached-only", "--v8-flags=--max-old-space-size=160", "src/index.js"]
