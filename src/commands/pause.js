import { SlashCommandBuilder } from 'discord.js';
import { queues } from '../music/queues.js';

export default {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause playback'),
    async execute(interaction) {
        const queue = queues.get(interaction.guildId);
        if (!queue?.playing) return interaction.reply({ content: 'Nothing playing.', ephemeral: true });
        queue.pause();
        await interaction.reply('⏸️ Paused.');
    }
};
