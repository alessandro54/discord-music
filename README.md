# Personal Music Discord Bot

Personal Discord bot. Built with discord.js v14.

## Features

- **Music**: play, pause, resume, skip, stop, seek, queue, now-playing — powered by play-dl
- **Moderation**: kick, timeout
- **Utility**: coinflip, poll, serverinfo, help

## Setup

```bash
pnpm install
```

Create `.env`:

```
DISCORD_TOKEN=your_token
CLIENT_ID=1513765585794895872
GUILD_ID=414892529427939338
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm start` | Run bot |
| `pnpm dev` | Run with auto-restart |
| `pnpm deploy` | Register slash commands |

## Architecture

- `src/index.js` — bootstraps client, auto-loads commands and events
- `src/commands/` — slash commands, each exports `{ data, execute }`
- `src/events/` — event handlers, each exports `{ name, once?, execute }`
- `src/music/` — music queue/player logic

Drop a file in `commands/` or `events/` and it loads automatically. Run `pnpm deploy` after adding or changing commands.

## Stack

- Node.js + discord.js v14
- @discordjs/voice + play-dl for music
- pnpm
