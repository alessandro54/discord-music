import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { queues } from '../music/queues.js';

export default {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current queue'),
    async execute(interaction) {
        const queue = queues.get(interaction.guildId);
        if (!queue?.songs.length) return interaction.reply({ content: 'Queue is empty.', ephemeral: true });

        const songs = queue.songs;
        const lines = songs
            .slice(0, 10)
            .map((s, i) => `${i === 0 ? '▶️' : `\`${i}.\``} **${s.title}** \`${s.duration}\` — ${s.requestedBy}`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🎵 Queue — ${songs.length} song${songs.length !== 1 ? 's' : ''}`)
            .setDescription(lines + (songs.length > 10 ? `\n\n*...and ${songs.length - 10} more*` : ''));

        await interaction.reply({ embeds: [embed] });
    }
};
