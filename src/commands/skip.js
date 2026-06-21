import { SlashCommandBuilder } from "discord.js";
import { requirePlaying } from "../lib/guards.js";

export default {
    data: new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Skip the current song"),
    async execute(interaction) {
        const queue = requirePlaying(interaction);
        if (!queue) return;
        const title = queue.current?.title ?? "song";
        queue.skip();
        await interaction.reply(`⏭️ Skipped **${title}**.`);
    },
};
