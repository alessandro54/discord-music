import { queues } from "./guildQueue.js";

export function requirePlaying(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue?.playing) {
        interaction.reply({ content: "Nothing playing.", ephemeral: true });
        return null;
    }
    return queue;
}
