import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { requirePlaying } from "../music/guards.js";
import { formatMs, parseTimestamp } from "../music/utils.js";

export default {
    data: new SlashCommandBuilder()
        .setName("seek")
        .setDescription("Seek to a position in the current song")
        .addStringOption((o) =>
            o
                .setName("position")
                .setDescription("Timestamp (e.g. 1:30 or 90)")
                .setRequired(true),
        ),
    async execute(interaction) {
        const queue = requirePlaying(interaction);
        if (!queue) return;

        const input = interaction.options.getString("position");
        const seconds = parseTimestamp(input);
        if (seconds === null || seconds < 0) {
            return interaction.reply({
                content: "Invalid timestamp. Use `1:30` or `90`.",
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();
        const ok = await queue.seek(seconds);
        if (!ok) return interaction.editReply("Could not seek.");

        await interaction.editReply(
            `⏩ Seeked to **${formatMs(seconds * 1000)}**`,
        );
    },
};
