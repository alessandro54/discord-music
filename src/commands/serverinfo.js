import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Show server info'),
    async execute(interaction) {
        const guild = interaction.guild;
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: 'Members', value: `${guild.memberCount}`, inline: true },
                { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
                { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
                { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
                { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
                { name: 'Boost Level', value: `Tier ${guild.premiumTier}`, inline: true },
            );
        await interaction.reply({ embeds: [embed] });
    }
};
