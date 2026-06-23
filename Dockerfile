# syntax=docker/dockerfile:1

FROM denoland/deno:debian
WORKDIR /app

# Changing CACHEBUST (weekly scheduled builds pass github.run_id) invalidates
# the layer below so pip re-pulls the latest yt-dlp — keeps YouTube extraction
# working without manual intervention.
ARG CACHEBUST=

# yt-dlp via pip (not the standalone binary) so the bgutil PO-token provider
# plugin is auto-discovered — lets us bypass YouTube bot detection on datacenter
# IPs without cookies. Installed in a venv (Debian is PEP 668 externally-managed).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates python3 python3-venv \
    && python3 -m venv /opt/ytdlp \
    && /opt/ytdlp/bin/pip install --no-cache-dir -U yt-dlp "bgutil-ytdlp-pot-provider==1.3.1" \
    && ln -s /opt/ytdlp/bin/yt-dlp /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

COPY deno.json deno.lock ./
RUN deno install --allow-scripts \
    && deno eval "import '@db/sqlite'" 2>/dev/null || true

COPY src/ ./src/

ENV NODE_ENV=production \
    YTDLP_PATH=/usr/local/bin/yt-dlp

# Dashboard HTTP port — Dokku maps proxy 80 → this and injects PORT
EXPOSE 3000

CMD ["deno", "run", "--allow-all", "--cached-only", "src/index.js"]
