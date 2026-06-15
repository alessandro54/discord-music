import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { readdirSync } from 'fs';
import { resolve, dirname, sep } from 'path';
import { fileURLToPath } from 'url';
import { initPlayDl } from './music/initPlayDl.js';
import ffmpegPath from 'ffmpeg-static';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.on('unhandledRejection', err => console.error('[unhandledRejection]', err));
process.on('uncaughtException', err => console.error('[uncaughtException]', err));

// Add bundled ffmpeg to PATH for audio transcoding
process.env.PATH = `${dirname(ffmpegPath)}${sep}${process.env.PATH}`;

await initPlayDl();

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

// Load commands
for (const file of readdirSync(resolve(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
    const command = await import(`./commands/${file}`);
    if (command.default?.data && command.default?.execute) {
        client.commands.set(command.default.data.name, command.default);
    }
}

// Load events
for (const file of readdirSync(resolve(__dirname, 'events')).filter(f => f.endsWith('.js'))) {
    const event = await import(`./events/${file}`);
    const { name, once, execute } = event.default;
    if (once) {
        client.once(name, (...args) => execute(...args, client));
    } else {
        client.on(name, (...args) => execute(...args, client));
    }
}

client.login(process.env.DISCORD_TOKEN);
