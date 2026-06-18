import { MessageFlags } from "discord.js";
import { queues } from "./guildQueue.js";

export function requirePlaying(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue?.playing) {
        interaction.reply({ content: "Nothing playing.", flags: MessageFlags.Ephemeral });
        return null;
    }
    return queue;
}
