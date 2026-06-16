import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = [];
for (const file of readdirSync(resolve(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
    const command = await import(`./commands/${file}`);
    if (command.default?.data) commands.push(command.default.data.toJSON());
}

const rest = new REST().setToken(process.env.BOT_TOKEN);

console.log(`Deploying ${commands.length} commands...`);
await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
);
console.log('Commands deployed.');
