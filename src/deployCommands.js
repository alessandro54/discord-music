import { REST, Routes } from "discord.js";

const commands = [];
for (const entry of Deno.readDirSync(`${import.meta.dirname}/commands`)) {
    if (!entry.isFile || !entry.name.endsWith(".js")) continue;
    const command = await import(`./commands/${entry.name}`);
    if (command.default?.data) commands.push(command.default.data.toJSON());
}

const rest = new REST().setToken(
    Deno.env.get("BOT_TOKEN") ?? Deno.env.get("DISCORD_TOKEN"),
);

console.log(`Deploying ${commands.length} commands...`);
await rest.put(
    Routes.applicationGuildCommands(
        Deno.env.get("CLIENT_ID"),
        Deno.env.get("GUILD_ID"),
    ),
    { body: commands },
);
console.log("Commands deployed.");
