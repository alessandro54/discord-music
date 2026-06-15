import { SlashCommandBuilder } from 'discord.js';
import { queues } from '../music/queues.js';

export default {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume playback'),
    async execute(interaction) {
        const queue = queues.get(interaction.guildId);
        if (!queue) return interaction.reply({ content: 'Nothing playing.', ephemeral: true });
        queue.resume();
        await interaction.reply('▶️ Resumed.');
    }
};
