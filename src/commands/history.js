import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHistory } from '../db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Show recently played songs'),
    async execute(interaction) {
        const songs = await getHistory(interaction.guildId, 10);
        if (!songs.length) return interaction.reply({ content: 'No history yet.', ephemeral: true });

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎵 Recently Played')
            .setDescription(
                songs.map((s, i) => `\`${i + 1}.\` **[${s.title}](${s.url})** · ${s.user_tag}`).join('\n')
            );

        return interaction.reply({ embeds: [embed] });
    }
};
