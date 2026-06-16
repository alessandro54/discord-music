import { SlashCommandBuilder } from "discord.js";
import { embed } from "../lib/embeds.js";

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show all commands"),
    async execute(interaction) {
        await interaction.reply({
            embeds: [
                embed().setTitle("Bot Commands").addFields(
                    {
                        name: "🎵 Music",
                        value: "`/play` `/skip` `/stop` `/queue` `/np` `/seek` `/pause` `/resume` `/history`",
                    },
                    { name: "🛡️ Moderation", value: "`/kick` `/timeout`" },
                    { name: "🎮 Fun", value: "`/poll` `/coinflip`" },
                    { name: "ℹ️ Info", value: "`/serverinfo` `/help`" },
                ),
            ],
        });
    },
};
