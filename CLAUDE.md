# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Personal Music Discord Bot

Personal Discord bot hosted on Fly.io.

## Stack
- discord.js v14
- Deno (runtime, local dev + production)
- Docker (deployment)
- youtubei.js (Innertube) — YouTube search + video metadata
- yt-dlp (bundled PyInstaller binary at `src/yt-dlp`) — audio streaming + playlist dump
- ffmpeg — transcode on seek only

## Bot Info
- App ID: 1513765585794895872
- Token: stored in .env as `BOT_TOKEN`
- Guild ID: 414892529427939338

## Commands
- `deno task dev` — run with auto-restart (src/ directly)
- `deno task deploy` — register slash commands with Discord API

## .env Required Keys
```
BOT_TOKEN=
CLIENT_ID=1513765585794895872
GUILD_ID=414892529427939338
DB_URL=sqlite:/data/bot.db   # sqlite:<path>; non-sqlite prefixes fall back to ./bot.db
SPOTIFY_CLIENT_ID=           # for /play with Spotify track/playlist/album URLs
SPOTIFY_CLIENT_SECRET=
YOUTUBE_COOKIES=             # Netscape cookies — optional on gru, helps with intermittent 403s
OWNER_ID=                    # Discord user id allowed to run /debug (admin-only + owner-gated)
```

## Architecture

Layered. Commands are thin controllers; logic lives in services; rendering in views.

```
src/
  commands/  slash-command handlers — parse interaction → call service → render view → reply
  events/    discord event handlers
  services/  domain + infra: guildQueue (playback engine + queues Map), stream (yt-dlp/Innertube),
             spotify, resolver (query → songs), playback (getOrCreateQueue/enqueue)
  views/     response/embed builders (musicEmbeds)
  lib/       shared helpers: guards (interaction guards), utils (formatting), db, embeds,
             constants, logger, server, buildInfo, config
```

Keep commands dumb: validate input, delegate to a service, render a view. Services have no
discord-interaction coupling (guards are the deliberate exception). `play.js` is the reference
pattern (`ensureVoice` → `resolveQuery` → `getOrCreateQueue`/`enqueue` → `trackQueued`/`playlistQueued`).

`src/index.js` statically imports all commands and events. **When adding a new command or event, you must manually add the import and register it in index.js.**

**Commands** (`src/commands/*.js`) — each file exports default `{ data, execute }` (+ optional `autocomplete`):
- `data` — `SlashCommandBuilder` instance
- `execute(interaction, client)` — handler

After adding/changing commands, run `deno task deploy` to register with Discord.

**Events** (`src/events/*.js`) — each file exports default `{ name, once?, execute }`:
- `name` — Discord.js event name
- `once: true` — fires once only
- `execute(...args, client)` — client appended as last arg

## Build & Deploy

No build step — Deno runs `src/index.js` directly. `deno.json` defines tasks and JSR imports (`@db/sqlite`). `deno.lock` pins all dependencies.

CI (GitHub Actions) runs on push to `main` when `src/**/*.js`, `package.json`, `deno.json`, `deno.lock`, `Dockerfile`, or `fly.toml` changes:
1. Write build info (`src/lib/buildInfo.js`)
2. `flyctl deploy --remote-only` — builds Docker image on Fly, deploys to **gru** (Brazil) region

**Pushing to `main` triggers a production deploy that restarts the live bot. Never push without explicit approval.**

Fly.io secrets: `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `YOUTUBE_COOKIES`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`. GitHub secret: `FLY_API_TOKEN`.
SQLite persisted at `/data/bot.db` on a 1GB Fly volume (`data`, gru).

## VM & Memory
- VM: `shared-cpu-1x`, **512MB RAM + 512MB swap** (`fly.toml`). Deno heap capped at 160MB (`--v8-flags=--max-old-space-size=160`, Dockerfile CMD).
- Budget is tight: deno baseline ~90-220MB + yt-dlp stream ~70MB + ffmpeg (seek) ~50MB. Swap absorbs the transient spike.
- **Process hygiene is critical.** Each play spawns yt-dlp (PyInstaller = parent + ~70MB child). `GuildQueue._killStream` → `destroyResource` (`services/stream.js`) must reap them: closes the output stream (EOF), SIGTERM (PyInstaller forwards to its child), awaits `.status`, SIGKILL fallback after 2s. Skipping the reap leaks ~70MB per song → kernel OOM-kills deno → bot dies mid-playback. Do not regress this.
- 256MB is not viable — deno's working set alone would thrash swap.

## Audio Pipeline (`src/services/`)
- `searchVideo` / `fetchVideoInfo` (`stream.js`) → **Innertube** (in-process, no subprocess). Search + metadata only.
- `createStream` → **yt-dlp** subprocess streams webm/opus (`StreamType.WebmOpus`, no transcode). Seek path pipes through ffmpeg. yt-dlp args include `--retries`/`--extractor-retries` for transient googlevideo 403s.
- `fetchPlaylistItems` → yt-dlp `--flat-playlist --dump-json` (transient).
- Innertube `download()` does **not** work reliably in Deno (IOS client 403s on many videos; WEB/ANDROID can't decipher — no JS interpreter for nsig). Keep yt-dlp for playback.
- Playback is sequential — only one yt-dlp alive at a time. Albums/playlists are a metadata queue (`GuildQueue.songs`); Spotify tracks resolve to YouTube lazily in `_playNext`.

## Database (`src/lib/db.js`)
- Adapter pattern. `initDb` picks: **Turso** if `TURSO_DATABASE_URL` is set (or `DB_URL` starts with `libsql://`), else **SQLite** (`@db/sqlite`) from `DB_URL` (`sqlite:<path>`, default `./bot.db`). mysql adapter removed.
- Turso uses `@libsql/client/web` (pure-HTTP Hrana, no native bindings — Deno/Docker safe). Secrets: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (full-access, not read-only).
- Switching to Turso does **not** migrate existing `/data/bot.db` rows — history starts fresh on Turso.
- Both adapters coerce `undefined` binds to `null` (`@db/sqlite` rejects undefined).

## YouTube Cookies
Region is **gru** (Brazil), which mostly avoids bot detection. Occasional `HTTP 403 Forbidden` on individual videos still happens (datacenter IP throttle); the bot skips to the next track. If 403s become frequent, set cookies. iad (US) needs them.
Export Netscape-format cookies from a browser logged into YouTube (throwaway account), then:
```bash
fly secrets set YOUTUBE_COOKIES="$(cat cookies.txt)" --app discord-music-alr6jw
```
`stream.js` wires `COOKIES_ARGS` automatically when the secret exists. Cookies expire periodically (~months). When `/play` fails with "Sign in to confirm", re-export and reset.

## Server Structure
- 📢 COMMUNITY: #welcome (ID: 902775878075940905), #general, #announcements, #introductions, #memes, #media
- 🎮 GAMING: #looking-for-group, #game-reviews, #clips, voice: General 1/2, Fortnite, delo, Quarantine (AFK)
- 🏆 LEAGUE OF LEGENDS: #lol-chat, #rank-flex, voice: Solo/Duo, Flex 3/5
- 🎵 MUSIC: #music-control (slash commands only), voice: Music
- 💬 OFF-TOPIC: #off-topic, #spam

## Notes
- `#music-control` is slash-commands-only — MESSAGE_SEND denied for @everyone
- Quarantine voice = AFK channel
- Intents (see `src/index.js`): Guilds, GuildMembers, GuildVoiceStates
