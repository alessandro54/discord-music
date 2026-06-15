import { SlashCommandBuilder } from 'discord.js';
import { queues } from '../music/queues.js';

function parseTimestamp(input) {
    const parts = input.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
}

export default {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Seek to a position in the current song')
        .addStringOption(o => o.setName('position').setDescription('Timestamp (e.g. 1:30 or 90)').setRequired(true)),
    async execute(interaction) {
        const queue = queues.get(interaction.guildId);
        if (!queue?.playing) return interaction.reply({ content: 'Nothing playing.', ephemeral: true });

        const input = interaction.options.getString('position');
        const seconds = parseTimestamp(input);
        if (seconds === null || seconds < 0) {
            return interaction.reply({ content: 'Invalid timestamp. Use `1:30` or `90`.', ephemeral: true });
        }

        await interaction.deferReply();
        const ok = await queue.seek(seconds);
        if (!ok) return interaction.editReply('Could not seek.');

        const m = Math.floor(seconds / 60);
        const s = String(seconds % 60).padStart(2, '0');
        await interaction.editReply(`⏩ Seeked to **${m}:${s}**`);
    }
};
