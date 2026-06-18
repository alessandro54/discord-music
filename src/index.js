import { Client, Collection, GatewayIntentBits } from "discord.js";
import { commands } from "./commands/index.js";
import guildMemberAdd from "./events/guildMemberAdd.js";
import interactionCreate from "./events/interactionCreate.js";
import ready from "./events/ready.js";
import { COMMIT, COMMIT_URL } from "./lib/buildInfo.js";
import { initDb } from "./lib/db.js";
import { log } from "./lib/logger.js";
import { startServer } from "./lib/server.js";
import { queues, setClient } from "./music/guildQueue.js";

process.on("unhandledRejection", (err) =>
    log.error(`unhandledRejection: ${err}`),
);
process.on("uncaughtException", (err) =>
    log.error(`uncaughtException: ${err}`),
);

log.info(`revision: ${COMMIT_URL ?? COMMIT}`);

const ytdlpBin = `${import.meta.dirname}/yt-dlp`;
try {
    Deno.statSync(ytdlpBin);
    try { Deno.chmodSync(ytdlpBin, 0o755); } catch {}
    Deno.env.set("YTDLP_PATH", ytdlpBin);
} catch {}
Deno.env.set("PATH", `${import.meta.dirname}${Deno.build.os === "windows" ? ";" : ":"}${Deno.env.get("PATH")}`);

await initDb();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.commands = new Collection();

for (const cmd of commands) {
    if (cmd?.data && cmd?.execute) client.commands.set(cmd.data.name, cmd);
}

for (const event of [guildMemberAdd, interactionCreate, ready]) {
    const { name, once, execute } = event;
    client[once ? "once" : "on"](name, (...args) => execute(...args, client));
}

setClient(client);

const port = Deno.env.get("SERVER_PORT") || Deno.env.get("PORT") || 3000;
startServer(port, queues, client);

client.login(Deno.env.get("BOT_TOKEN"));
