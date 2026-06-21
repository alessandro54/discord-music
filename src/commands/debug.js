import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getHealth } from "../services/health.js";
import { healthEmbed } from "../views/healthEmbed.js";

export default {
    data: new SlashCommandBuilder()
        .setName("debug")
        .setDescription("Show bot health & diagnostics")
        // Admin-only: hidden from regular members in the command picker.
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction, client) {
        const ownerId = Deno.env.get("OWNER_ID");
        if (ownerId && interaction.user.id !== ownerId) {
            return interaction.reply({ content: "Not authorized.", flags: MessageFlags.Ephemeral });
        }
        const health = getHealth(client);
        await interaction.reply({ embeds: [healthEmbed(health)], flags: MessageFlags.Ephemeral });
    },
};
