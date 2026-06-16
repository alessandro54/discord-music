import 'dotenv/config';
import { createServer } from 'http';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { dirname, join, sep } from 'path';
import { fileURLToPath } from 'url';
import { chmodSync, existsSync } from 'fs';
import ffmpegPath from 'ffmpeg-static';
import { initPlayDl } from './music/initPlayDl.js';
import { initDb } from './db.js';
import { log } from './logger.js';
import { COMMIT, COMMIT_URL } from './buildInfo.js';

import coinflip from './commands/coinflip.js';
import help from './commands/help.js';
import history from './commands/history.js';
import kick from './commands/kick.js';
import np from './commands/np.js';
import pause from './commands/pause.js';
import play from './commands/play.js';
import poll from './commands/poll.js';
import queue from './commands/queue.js';
import resume from './commands/resume.js';
import seek from './commands/seek.js';
import serverinfo from './commands/serverinfo.js';
import skip from './commands/skip.js';
import stop from './commands/stop.js';
import timeout from './commands/timeout.js';

import guildMemberAdd from './events/guildMemberAdd.js';
import interactionCreate from './events/interactionCreate.js';
import ready from './events/ready.js';

process.on('unhandledRejection', err => log.error(`unhandledRejection: ${err}`));
process.on('uncaughtException',  err => log.error(`uncaughtException: ${err}`));

log.info(`revision: ${COMMIT_URL ?? COMMIT}`);

const __dir = dirname(fileURLToPath(import.meta.url));
const ytdlpBin = join(__dir, 'yt-dlp');
if (existsSync(ytdlpBin)) {
    try { chmodSync(ytdlpBin, 0o755); } catch {}
    process.env.YTDLP_PATH = ytdlpBin;
}
process.env.PATH = `${__dir}${sep}${dirname(ffmpegPath)}${sep}${process.env.PATH}`;

await initPlayDl();
await initDb();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

client.commands = new Collection();

for (const cmd of [coinflip, help, history, kick, np, pause, play, poll, queue, resume, seek, serverinfo, skip, stop, timeout]) {
    if (cmd?.data && cmd?.execute) client.commands.set(cmd.data.name, cmd);
}

for (const event of [guildMemberAdd, interactionCreate, ready]) {
    const { name, once, execute } = event;
    client[once ? 'once' : 'on'](name, (...args) => execute(...args, client));
}

const port = process.env.SERVER_PORT || process.env.PORT || 3000;
createServer((_, res) => res.end('OK')).listen(port);

client.login(process.env.BOT_TOKEN);
