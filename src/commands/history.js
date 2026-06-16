import { SlashCommandBuilder } from "discord.js";
import { LIMITS } from "../lib/constants.js";
import { getHistory } from "../lib/db.js";
import { embed } from "../lib/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("history")
        .setDescription("Show recently played songs"),
    async execute(interaction) {
        const songs = await getHistory(interaction.guildId, LIMITS.HISTORY);
        if (!songs.length)
            return interaction.reply({
                content: "No history yet.",
                ephemeral: true,
            });

        return interaction.reply({
            embeds: [
                embed()
                    .setTitle("🎵 Recently Played")
                    .setDescription(
                        songs
                            .map(
                                (s, i) =>
                                    `\`${i + 1}.\` **[${s.title}](${s.url})** · ${s.user_tag}`,
                            )
                            .join("\n"),
                    ),
            ],
        });
    },
};
