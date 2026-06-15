import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
    async execute(interaction) {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        if (!target.kickable) return interaction.reply({ content: 'Cannot kick this user.', ephemeral: true });
        await target.kick(reason);
        await interaction.reply(`👢 **${target.user.tag}** kicked. Reason: ${reason}`);
    }
};
