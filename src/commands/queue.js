import { SlashCommandBuilder } from "discord.js";
import { LIMITS } from "../lib/constants.js";
import { embed } from "../lib/embeds.js";
import { queues } from "../music/guildQueue.js";

export default {
    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Show the current queue"),
    async execute(interaction) {
        const queue = queues.get(interaction.guildId);
        if (!queue?.songs.length)
            return interaction.reply({
                content: "Queue is empty.",
                ephemeral: true,
            });

        const { songs } = queue;
        const lines = songs
            .slice(0, LIMITS.QUEUE_DISPLAY)
            .map(
                (s, i) =>
                    `${i === 0 ? "▶️" : `\`${i}.\``} **${s.title}** \`${s.duration}\` — ${s.requestedBy}`,
            )
            .join("\n");

        const more =
            songs.length > LIMITS.QUEUE_DISPLAY
                ? `\n\n*...and ${songs.length - LIMITS.QUEUE_DISPLAY} more*`
                : "";

        await interaction.reply({
            embeds: [
                embed()
                    .setTitle(
                        `🎵 Queue — ${songs.length} song${songs.length !== 1 ? "s" : ""}`,
                    )
                    .setDescription(lines + more),
            ],
        });
    },
};
