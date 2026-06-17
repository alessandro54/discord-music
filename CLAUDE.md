# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Personal Music Discord Bot

Personal Discord bot hosted on Fly.io.

## Stack
- discord.js v14
- Node.js v20
- Bun (local dev)
- esbuild (bundler)
- Docker (deployment)

## Bot Info
- App ID: 1513765585794895872
- Token: stored in .env as `BOT_TOKEN`
- Guild ID: 414892529427939338

## Commands
- `bun dev` — run with auto-restart (src/ directly)
- `bun run build` — bundle src/ → dist/
- `bun run deploy` — register slash commands with Discord API

## .env Required Keys
```
BOT_TOKEN=
CLIENT_ID=1513765585794895872
GUILD_ID=414892529427939338
```

## Architecture

`src/index.js` statically imports all commands and events. **When adding a new command or event, you must manually add the import and register it in index.js.**

**Commands** (`src/commands/*.js`) — each file exports default `{ data, execute }`:
- `data` — `SlashCommandBuilder` instance
- `execute(interaction, client)` — handler

After adding/changing commands, run `bun run deploy` to register with Discord.

**Events** (`src/events/*.js`) — each file exports default `{ name, once?, execute }`:
- `name` — Discord.js event name
- `once: true` — fires once only
- `execute(...args, client)` — client appended as last arg

## Build & Deploy

esbuild bundles `src/index.js` into `dist/index.js`. Native modules (`@discordjs/opus`, `ffmpeg-static`, `@snazzah/davey`) are excluded from bundle and copied to `dist/node_modules/`.

CI (GitHub Actions) runs on push to `main` when `src/**/*.js`, `package.json`, `bun.lock`, `Dockerfile`, or `fly.toml` changes:
1. Write build info (`src/lib/buildInfo.js`)
2. `flyctl deploy --remote-only` — builds Docker image on Fly, deploys to `gru` region

Fly.io secrets: `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`. GitHub secret: `FLY_API_TOKEN`.
SQLite persisted at `/data/bot.db` on a 1GB Fly volume (`bot_data`).

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
