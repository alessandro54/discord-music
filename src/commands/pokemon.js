import { AttachmentBuilder, SlashCommandBuilder } from "discord.js";
import { embed } from "../lib/embeds.js";
import { getRandomPokemon } from "../services/pokemon.js";

export default {
    data: new SlashCommandBuilder()
        .setName("pokemon")
        .setDescription("Show a random pokemon sprite"),
    async execute(interaction) {
        await interaction.deferReply();
        const { name, png } = await getRandomPokemon();
        const file = new AttachmentBuilder(png, { name: "sprite.png" });
        await interaction.editReply({
            embeds: [embed().setTitle(name).setImage("attachment://sprite.png")],
            files: [file],
        });
    },
};
