import { SlashCommandBuilder } from "discord.js";
import { requirePlaying } from "../lib/guards.js";
import { nowPlayingControls, nowPlayingEmbed } from "../views/musicEmbeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("np")
        .setDescription("Show the currently playing song"),
    async execute(interaction) {
        const queue = requirePlaying(interaction);
        if (!queue?.current) return;
        await interaction.reply({
            embeds: [nowPlayingEmbed(queue)],
            components: [nowPlayingControls(queue)],
        });
    },
};
