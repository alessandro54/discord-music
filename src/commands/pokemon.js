import { SlashCommandBuilder } from "discord.js";
import { embed } from "../lib/embeds.js";
import { getRandomPokemon } from "../services/pokemon.js";

export default {
    data: new SlashCommandBuilder()
        .setName("pokemon")
        .setDescription("Show a random pokemon sprite"),
    async execute(interaction) {
        await interaction.deferReply();
        const { name, art } = await getRandomPokemon();
        await interaction.editReply({
            embeds: [embed().setTitle(name).setDescription(`\`\`\`ansi\n${art}\n\`\`\``)],
        });
    },
};
