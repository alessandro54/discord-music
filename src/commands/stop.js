import { SlashCommandBuilder } from 'discord.js';
import { queues } from '../music/queues.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop music and clear the queue'),
    async execute(interaction) {
        const queue = queues.get(interaction.guildId);
        if (!queue?.playing) return interaction.reply({ content: 'Nothing playing.', ephemeral: true });
        queue.stop();
        await interaction.reply('⏹️ Stopped and cleared queue.');
    }
};
