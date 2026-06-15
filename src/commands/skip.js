import { SlashCommandBuilder } from 'discord.js';
import { queues } from '../music/queues.js';

export default {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),
    async execute(interaction) {
        const queue = queues.get(interaction.guildId);
        if (!queue?.playing) return interaction.reply({ content: 'Nothing playing.', ephemeral: true });
        queue.skip();
        await interaction.reply(`⏭️ Skipped **${queue.current?.title ?? 'song'}**.`);
    }
};
