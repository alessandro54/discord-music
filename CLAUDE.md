# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Personal Music Discord Bot

Personal Discord bot hosted on Fly.io.

## Stack
- discord.js v14
- Deno (runtime, local dev + production)
- Docker (deployment)

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
YOUTUBE_COOKIES=        # Netscape-format cookies — required on datacenter IPs (bot detection bypass)
```

## Architecture

`src/index.js` statically imports all commands and events. **When adding a new command or event, you must manually add the import and register it in index.js.**

**Commands** (`src/commands/*.js`) — each file exports default `{ data, execute }`:
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
2. `flyctl deploy --remote-only` — builds Docker image on Fly, deploys to `iad` region

Fly.io secrets: `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `YOUTUBE_COOKIES`. GitHub secret: `FLY_API_TOKEN`.
SQLite persisted at `/data/bot.db` on a 1GB Fly volume (`bot_data`).

## YouTube Cookies
Bot detection on Fly **iad** (US) requires YouTube cookies — **gru** (Brazil) does not.
If region is ever switched back to iad, export Netscape-format cookies from a browser logged into YouTube (throwaway account), then:
```bash
fly secrets set YOUTUBE_COOKIES="$(cat cookies.txt)" --app discord-music-alr6jw
```
Cookies expire periodically (~months). When `/play` starts failing with "Sign in to confirm", re-export and reset.

## Server Structure
- 📢 COMMUNITY: #welcome (ID: 902775878075940905), #general, #announcements, #introductions, #memes, #media
- 🎮 GAMING: #looking-for-group, #game-reviews, #clips, voice: General 1/2, Fortnite, delo, Quarantine (AFK)
- 🏆 LEAGUE OF LEGENDS: #lol-chat, #rank-flex, voice: Solo/Duo, Flex 3/5
- 🎵 MUSIC: #music-control (slash commands only), voice: Music
- 💬 OFF-TOPIC: #off-topic, #spam

## Notes
- `#music-control` is slash-commands-only — MESSAGE_SEND denied for @everyone
- Quarantine voice = AFK channel
- Intents: Guilds, GuildMembers, GuildMessages, MessageContent, GuildVoiceStates
