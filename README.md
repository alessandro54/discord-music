# oerni-bot

A self-hosted Discord music bot that actually respects your server's CPU. Built on yt-dlp and WebmOpus passthrough — no transcoding for normal playback, ~5% CPU instead of 50%.

> Fork it, configure it, run it. Your server, your data.

---

## Why this over other bots?

Most music bots transcode everything through ffmpeg at 256k even when the source is already Opus. This bot streams WebM/Opus directly from YouTube — ffmpeg only runs for seeks.

- **Low CPU** — WebmOpus passthrough, zero transcoding for normal play
- **Reliable** — yt-dlp as the backend, not fragile scrapers
- **No vendor lock-in** — self-hosted, your data stays yours
- **Zero infra required** — SQLite by default, MySQL optional
- **Web dashboard** — now playing, queue controls, server config
- **Spotify support** — tracks, albums, playlists via YouTube resolution

---

## Features

- Play from YouTube (URL, search, playlist) or Spotify (track, album, playlist)
- Queue with position tracking, skip, seek, pause/resume, stop
- `/np` — now playing embed with inline buttons
- Song history (SQLite by default)
- Web dashboard with live queue + skip/pause/stop controls
- Per-guild config (welcome channel, rules channel) via dashboard or `/setup`
- Autocomplete shows recent history when query is empty

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
# DB_URL=mysql://user:pass@host:3306/dbname

# Optional — protect the web dashboard
DASHBOARD_TOKEN=your_secret_token
```

### 3. Run

```bash
bun install
bun run deploy   # register slash commands (once)
bun dev          # local dev with auto-restart
```

---

## Deployment

Push to `main` — GitHub Actions builds and deploys automatically via SFTP.

Tested on [Mamba Host](https://mamba.host) (Node.js v20). Works on any Node.js v20+ host.

**Required secrets/vars in GitHub:** `SFTP_PASSWORD`, `SFTP_HOST`, `SFTP_PORT`, `SFTP_USERNAME`  
**Required env vars on host:** `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`

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
| `/help` | All commands |

---

## Stack

| | |
|---|---|
| Runtime | Node.js v20 |
| Bot | discord.js v14 |
| Audio | @discordjs/voice · WebmOpus passthrough · ffmpeg for seeks |
| Source | yt-dlp (binary, auto-downloaded in CI) |
| Database | better-sqlite3 (default) · mysql2 (optional) |
| Build | Bun + bun build |
| CI/CD | GitHub Actions → SFTP |

---

## Development

```bash
bun install          # install deps
bun dev              # run with auto-restart
bun test             # run tests
bun run lint         # Biome lint
bun run build        # bundle → dist/index.js
bun run deploy       # register slash commands
```

---

## License

MIT
