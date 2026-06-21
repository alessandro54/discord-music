import { SlashCommandBuilder } from "discord.js";
import { requirePlaying } from "../lib/guards.js";

export default {
    data: new SlashCommandBuilder()
        .setName("resume")
        .setDescription("Resume playback"),
    async execute(interaction) {
        const queue = requirePlaying(interaction);
        if (!queue) return;
        queue.resume();
        await interaction.reply("▶️ Resumed.");
    },
};
