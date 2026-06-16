import { SlashCommandBuilder } from "discord.js";
import { requirePlaying } from "../music/guards.js";

export default {
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop music and clear the queue"),
    async execute(interaction) {
        const queue = requirePlaying(interaction);
        if (!queue) return;
        queue.stop();
        await interaction.reply("⏹️ Stopped and cleared queue.");
    },
};
