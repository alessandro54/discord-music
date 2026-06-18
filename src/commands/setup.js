import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getConfig, setConfig } from "../lib/config.js";

export default {
    data: new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Configure bot settings for this server")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((s) =>
            s
                .setName("welcome")
                .setDescription("Set the welcome channel")
                .addChannelOption((o) =>
                    o.setName("channel").setDescription("Channel to send welcome messages").setRequired(true),
                ),
        )
        .addSubcommand((s) =>
            s
                .setName("rules")
                .setDescription("Set the rules channel (linked in welcome message)")
                .addChannelOption((o) =>
                    o.setName("channel").setDescription("Rules channel").setRequired(true),
                ),
        )
        .addSubcommand((s) =>
            s.setName("show").setDescription("Show current configuration"),
        ),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === "show") {
            const config = getConfig(interaction.guildId);
            return interaction.reply({
                content: [
                    `**Bot config for this server:**`,
                    `Welcome channel: ${config.welcome_channel_id ? `<#${config.welcome_channel_id}>` : "not set"}`,
                    `Rules channel: ${config.rules_channel_id ? `<#${config.rules_channel_id}>` : "not set"}`,
                ].join("\n"),
                flags: MessageFlags.Ephemeral,
            });
        }

        const channel = interaction.options.getChannel("channel");
        const patch =
            sub === "welcome"
                ? { welcome_channel_id: channel.id }
                : { rules_channel_id: channel.id };

        setConfig(interaction.guildId, patch);
        return interaction.reply({
            content: `✅ ${sub === "welcome" ? "Welcome" : "Rules"} channel set to <#${channel.id}>`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
