# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# OERNI Bot

Personal Discord bot for the OERNI server (ID: 414892529427939338).

## Stack
- discord.js v14
- Node.js
- pnpm

## Bot Info
- App ID: 1513765585794895872
- Token: stored in .env as DISCORD_TOKEN
- Guild ID: 414892529427939338

## Commands
- `pnpm start` — run bot
- `pnpm dev` — run with nodemon (auto-restart)
- `pnpm deploy` — register slash commands with Discord API (must run after adding/changing commands)

## .env Required Keys
```
DISCORD_TOKEN=
CLIENT_ID=1513765585794895872
GUILD_ID=414892529427939338
```

## Architecture

`src/index.js` bootstraps the client, then auto-loads all files from `src/commands/` and `src/events/` at startup. No manual registration needed — drop a file in the right folder and it loads.

**Commands** (`src/commands/*.js`) — each file exports `{ data, execute }`:
- `data` — `SlashCommandBuilder` instance defining the command
- `execute(interaction, client)` — handler; use `interaction.reply()` or `interaction.followUp()` for responses

After adding or changing commands, run `pnpm deploy` to push them to Discord. Commands are guild-scoped (instant update, no propagation delay).

**Events** (`src/events/*.js`) — each file exports `{ name, once?, execute }`:
- `name` — Discord.js event name (e.g. `'guildMemberAdd'`, `'interactionCreate'`)
- `once: true` — use `client.once` instead of `client.on`
- `execute(...args, client)` — client appended as last arg by the loader

`interactionCreate.js` routes slash commands to the matching command handler and wraps execution in try/catch.

## Server Structure
- 📢 COMMUNITY: #welcome (channel ID: 902775878075940905), #general, #announcements, #introductions, #memes, #media
- 🎮 GAMING: #looking-for-group, #game-reviews, #clips, voice: General 1/2, Fortnite, delo, Quarantine (AFK)
- 🏆 LEAGUE OF LEGENDS: #lol-chat, #rank-flex, voice: Solo/Duo, Flex 3/5
- 🎵 MUSIC: #music-control (slash commands only), voice: Music
- 💬 OFF-TOPIC: #off-topic, #spam

## Notes
- `#music-control` is slash-commands-only — MESSAGE_SEND denied for @everyone
- Quarantine voice = AFK channel
- Intents enabled: Guilds, GuildMembers, GuildMessages, MessageContent, GuildVoiceStates
