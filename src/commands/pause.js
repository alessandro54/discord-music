import { SlashCommandBuilder } from "discord.js";
import { requirePlaying } from "../music/guards.js";

export default {
    data: new SlashCommandBuilder()
        .setName("pause")
        .setDescription("Pause playback"),
    async execute(interaction) {
        const queue = requirePlaying(interaction);
        if (!queue) return;
        queue.pause();
        await interaction.reply("⏸️ Paused.");
    },
};
