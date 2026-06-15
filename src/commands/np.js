import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { AudioPlayerStatus } from '@discordjs/voice';
import { queues } from '../music/queues.js';

function formatMs(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function parseTimestamp(ts) {
    if (!ts || ts === 'Unknown') return null;
    const parts = ts.split(':').map(Number);
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    return null;
}

function progressBar(elapsed, total, length = 20) {
    const ratio = Math.min(elapsed / total, 1);
    const filled = Math.round(ratio * length);
    return '▬'.repeat(filled) + '🔘' + '▬'.repeat(length - filled);
}

export function buildNpComponents(queue) {
    const isPaused = queue.player.state.status === AudioPlayerStatus.Paused;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('np:pause').setEmoji(isPaused ? '▶️' : '⏸️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('np:skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('np:stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
    );
}

export function buildNpEmbed(queue) {
    const song = queue.current;
    const elapsedMs = (queue.resource?.playbackDuration ?? 0) + (queue.seekOffset * 1000);
    const totalMs = parseTimestamp(song.duration);

    const progressLine = totalMs
        ? `${progressBar(elapsedMs, totalMs)}\n\`${formatMs(elapsedMs)} / ${song.duration}\``
        : `\`${formatMs(elapsedMs)} elapsed\``;

    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎵 Now Playing')
        .setDescription(`**${song.title}**\n\n${progressLine}`)
        .addFields(
            { name: 'Requested by', value: song.requestedBy, inline: true },
            { name: 'Up next', value: queue.songs[1]?.title ?? 'Nothing', inline: true }
        );
}

export default {
    data: new SlashCommandBuilder()
        .setName('np')
        .setDescription('Show the currently playing song'),
    async execute(interaction) {
        const queue = queues.get(interaction.guildId);
        if (!queue?.playing || !queue.current) {
            return interaction.reply({ content: 'Nothing playing.', ephemeral: true });
        }

        await interaction.reply({
            embeds: [buildNpEmbed(queue)],
            components: [buildNpComponents(queue)],
        });
    }
};
