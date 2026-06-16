import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout a member")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((o) =>
            o
                .setName("user")
                .setDescription("User to timeout")
                .setRequired(true),
        )
        .addIntegerOption((o) =>
            o
                .setName("minutes")
                .setDescription("Duration in minutes")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(40320),
        )
        .addStringOption((o) =>
            o.setName("reason").setDescription("Reason").setRequired(false),
        ),
    async execute(interaction) {
        const target = interaction.options.getMember("user");
        const minutes = interaction.options.getInteger("minutes");
        const reason =
            interaction.options.getString("reason") || "No reason provided";
        await target.timeout(minutes * 60 * 1000, reason);
        await interaction.reply(
            `⏱️ **${target.user.tag}** timed out for ${minutes}min. Reason: ${reason}`,
        );
    },
};
