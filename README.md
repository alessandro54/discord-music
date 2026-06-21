# music-bot

> **Lightweight, high-performance Discord music bot. Self-hosted. Zero compromise.**

![Deno](https://img.shields.io/badge/Deno-2.x-000000?logo=deno&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![CPU](https://img.shields.io/badge/CPU-~5%25_on_playback-brightgreen)

Most Discord music bots transcode everything through ffmpeg at 256k — even when the audio is already Opus. music-bot streams WebM/Opus directly from YouTube. **ffmpeg never runs for normal playback.**

The result: ~5% CPU instead of 50%. No quality loss. No added latency.

---

## Why music-bot?

- **WebmOpus passthrough** — zero transcoding, lowest CPU of any self-hosted bot
- **In-process search** — YouTube search + metadata via youtubei.js (Innertube), no subprocess
- **yt-dlp streaming** — battle-tested, updated daily, handles everything YouTube throws at it
- **Self-hosted** — your server, your data, no subscriptions, no rate limits
- **SQLite out of the box** — no database to set up, works on day one
- **Web dashboard** — live queue, controls, and per-guild config from your browser
- **Spotify support** — tracks, albums, playlists resolved to YouTube automatically
- **Album art** — Now Playing embeds show Spotify/YouTube cover art

---

## Features

- Play from YouTube (URL, search, playlist) or Spotify (track, album, playlist)
- Queue with position tracking, skip, seek, pause/resume, stop
- `/np` — now playing embed with album art + inline buttons
- Autocomplete returns live YouTube video results (title + duration); recent history when empty
- Song history (SQLite by default)
- Web dashboard with live queue + skip/pause/stop controls
- Per-guild config (welcome channel, rules channel) via dashboard or `/setup`
- `/debug` — owner-gated health snapshot (memory, live streams, queue state)
- Resilient playback: stall watchdog skips a hung stream; auto-retries transient 403s

---

## Quick start

### 1. Create a Discord application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) → New Application
2. Bot tab → Add Bot → copy token
3. OAuth2 → URL Generator → `bot` + `applications.commands` → invite to your server

### 2. Configure

```env
# .env
BOT_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id

# Optional — Spotify support
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Optional — override default SQLite path (./bot.db)
# DB_URL=sqlite:./custom.db

# Optional — restrict /debug to a single Discord user id (admin-only otherwise)
OWNER_ID=

# Optional — protect the web dashboard
DASHBOARD_TOKEN=your_secret_token

# Optional — YouTube cookies (bypass bot detection on datacenter IPs)
# Export from browser as Netscape format, paste full content here
YOUTUBE_COOKIES=
```

### 3. Run

```bash
deno install --allow-scripts
deno task deploy   # register slash commands (once)
deno task dev      # local dev with auto-restart
```

---

## Deployment

Push to `main` — GitHub Actions builds the Docker image and deploys to Fly.io. A Fly
`release_command` re-registers slash commands on every deploy, so you only run
`deno task deploy` manually for local dev.

**Required GitHub secret:** `FLY_API_TOKEN`  
**Required Fly.io secrets:** `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`  
**Optional Fly.io secrets:** `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `OWNER_ID`, `YOUTUBE_COOKIES`

---

## Dashboard

The bot serves a web dashboard on `SERVER_PORT` (default `3000`).

```
http://your-host:port/         # now playing + queue controls
http://your-host:port/config   # server configuration
```

If `DASHBOARD_TOKEN` is set, append `?token=<your_token>` to the URL. The token is logged on startup.

---

## Commands

### Music
| Command | Description |
|---------|-------------|
| `/play <query>` | YouTube URL/search, Spotify track/album/playlist |
| `/np` | Now playing with pause/skip/stop buttons |
| `/queue` | Current queue |
| `/skip` | Skip current song |
| `/seek <position>` | Seek to timestamp (`1:30` or `90`) |
| `/pause` / `/resume` | Pause or resume |
| `/stop` | Stop and clear queue |
| `/history` | Last 10 songs played |

### Server
| Command | Description |
|---------|-------------|
| `/setup welcome #channel` | Set welcome channel |
| `/setup rules #channel` | Set rules channel |
| `/setup show` | Show current config |

### Misc
| Command | Description |
|---------|-------------|
| `/poll <question>` | Create a reaction poll |
| `/coinflip` | Flip a coin |
| `/kick` / `/timeout` | Moderation |
| `/serverinfo` | Server stats |
| `/debug` | Health snapshot — memory, live streams, queue state (owner/admin only) |
| `/help` | All commands |

---

## Stack

| | |
|---|---|
| Runtime | Deno 2.x |
| Bot | discord.js v14 |
| Audio | @discordjs/voice · WebmOpus passthrough · ffmpeg for seeks |
| Search/metadata | youtubei.js (Innertube), in-process |
| Streaming | yt-dlp (bundled binary) |
| Database | @db/sqlite (Deno-native) |
| Build | No build step — Deno runs src/ directly |
| CI/CD | GitHub Actions → Fly.io (Docker, gru region, 512MB + swap) |

---

## Architecture

Layered — commands are thin controllers; logic lives in services, rendering in views.

```
src/
  commands/   slash-command handlers (parse → service → view → reply)
  events/     discord event handlers
  services/   music/ (guildQueue, stream, spotify, resolver, playback), health
  views/      embed builders
  lib/        guards, utils, db, embeds, constants, logger, server
```

- **Search vs playback split:** `searchVideo`/`fetchVideoInfo` use Innertube (in-process);
  `createStream` uses yt-dlp. Innertube can't reliably decipher stream URLs in Deno, so
  yt-dlp stays for playback.
- **Process hygiene:** each play spawns a yt-dlp child (~70MB). `destroyResource` reaps it
  (SIGTERM → await exit → SIGKILL fallback) on skip/stop/idle. Skipping the reap leaks
  memory and OOM-kills the bot on the 512MB VM.

---

## Development

```bash
deno install --allow-scripts   # install deps
deno task dev                  # run with auto-restart
deno task start                # run without watch
deno task deploy               # register slash commands
```

---

## License

MIT
