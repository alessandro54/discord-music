import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { queues } from "../services/music/guildQueue.js";
import { queueEmbed } from "../views/musicEmbeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("queue")
        .setDescription("Show the current queue"),
    async execute(interaction) {
        const queue = queues.get(interaction.guildId);
        if (!queue?.songs.length) {
            return interaction.reply({ content: "Queue is empty.", flags: MessageFlags.Ephemeral });
        }
        await interaction.reply({ embeds: [queueEmbed(queue)] });
    },
};
