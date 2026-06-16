# Personal Music Discord Bot

A feature-rich personal Discord bot with music playback, moderation, and song history.

---

## Features

### Music
- Play from YouTube URLs, YouTube search, or Spotify tracks/playlists/albums
- Queue management with position tracking
- Controls: pause, resume, skip, stop, seek
- Now playing embed with interactive buttons
- Song history stored in MySQL with user attribution

### Moderation
- Kick members
- Timeout members

### Utility
- Coin flip
- Poll creation
- Server info
- Help command

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v20 |
| Bot framework | discord.js v14 |
| Voice | @discordjs/voice + @discordjs/opus |
| Audio | ffmpeg-static + play-dl |
| Database | MySQL 8 via mysql2 |
| Package manager | Bun |
| Bundler | esbuild |
| CI/CD | GitHub Actions → Mamba Host (SFTP) |

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Discord bot token (from Dev Portal → Bot tab) |
| `CLIENT_ID` | Discord application ID |
| `GUILD_ID` | Discord server ID |

### Optional

| Variable | Description |
|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Spotify app client ID — enables Spotify support |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |
| `DB_URL` | MySQL connection string — enables song history |

### Example `.env`

```env
BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id

SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

DB_URL=mysql://user:password@host:3306/dbname
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/play <query>` | Play from YouTube URL, search, or Spotify link |
| `/skip` | Skip current song |
| `/stop` | Stop playback and clear queue |
| `/pause` | Pause playback |
| `/resume` | Resume playback |
| `/seek <seconds>` | Seek to position |
| `/queue` | Show current queue |
| `/np` | Now playing with controls |
| `/history` | Last 10 songs played (requires DB) |
| `/kick <user>` | Kick a member |
| `/timeout <user>` | Timeout a member |
| `/poll <question>` | Create a poll |
| `/coinflip` | Flip a coin |
| `/serverinfo` | Show server information |
| `/help` | List all commands |

---

## Development

```bash
# Install dependencies
bun install

# Run locally (auto-restart)
bun dev

# Register slash commands with Discord
bun run deploy

# Build for production
bun run build
```

---

## Deployment

Push to `main` — GitHub Actions automatically:
1. Installs dependencies with Bun
2. Bundles with esbuild → `dist/index.js`
3. Copies native modules to `dist/node_modules/`
4. Deploys `dist/` to Mamba Host via SFTP

**Mamba Host env vars required:** `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`  
**Startup file:** `index.js`
