import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all commands'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Bot Commands')
            .addFields(
                { name: '🎵 Music', value: '`/play` `/skip` `/stop` `/queue`' },
                { name: '🛡️ Moderation', value: '`/kick` `/ban` `/timeout` `/warn`' },
                { name: '🎮 Fun', value: '`/poll` `/meme` `/coinflip`' },
                { name: 'ℹ️ Info', value: '`/help` `/userinfo` `/serverinfo`' }
            );
        await interaction.reply({ embeds: [embed] });
    }
};
