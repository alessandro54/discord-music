import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';
import { getYoutubeInfo } from '../music/stream.js';
import { YouTube } from 'youtube-sr';
import { queues } from '../music/queues.js';
import { GuildQueue } from '../music/GuildQueue.js';
import { resolveSpotify, getTrackMeta, isSpotifyUrl } from '../music/spotify.js';
import { log } from '../logger.js';

const YOUTUBE_RE = /(?:youtube\.com|youtu\.be)/;

async function resolveSongs(query, requestedBy, requestedById) {
    if (isSpotifyUrl(query)) {
        return resolveSpotify(query, requestedBy, requestedById);
    }

    if (YOUTUBE_RE.test(query)) {
        const v = await getYoutubeInfo(query);
        return {
            songs: [{ title: v.title, url: v.url, duration: v.duration, requestedBy, requestedById, spotifyTrack: null }],
            playlistName: null,
        };
    }

    const results = await YouTube.search(query, { limit: 1, type: 'video' });
    if (!results.length) return { songs: [], playlistName: null };
    const v = results[0];
    return {
        songs: [{ title: v.title, url: v.url, duration: v.duration?.timestamp ?? 'Unknown', requestedBy, requestedById, spotifyTrack: null }],
        playlistName: null,
    };
}

export default {
    async autocomplete(interaction) {
        const query = interaction.options.getFocused();
        if (query.length < 2) return interaction.respond([]);

        try {
            if (isSpotifyUrl(query)) {
                const meta = await getTrackMeta(query);
                if (meta) {
                    return interaction.respond([{ name: `${meta.title} (${meta.duration})`.slice(0, 100), value: query }]);
                }
                return interaction.respond([{ name: 'Spotify playlist/album — press Enter to queue', value: query }]);
            }

            if (YOUTUBE_RE.test(query)) return interaction.respond([]);

            const results = await YouTube.search(query, { limit: 5, type: 'video' });
            await interaction.respond(
                results.map(v => ({ name: v.title.slice(0, 100), value: v.url }))
            );
        } catch (err) {
            console.error('[autocomplete] error:', err.message);
            await interaction.respond([]);
        }
    },
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or playlist from YouTube or Spotify')
        .addStringOption(o => o.setName('query').setDescription('YouTube/Spotify URL or search query').setRequired(true).setAutocomplete(true)),
    async execute(interaction) {
        await interaction.deferReply();

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.editReply('Join a voice channel first.');
        }

        const query = interaction.options.getString('query');

        let resolved;
        try {
            resolved = await resolveSongs(query, interaction.user.tag, interaction.user.id);
        } catch (err) {
            console.error('[play] resolveSongs error:', err);
            return interaction.editReply('Could not find that song or playlist.');
        }

        const { songs, playlistName } = resolved;
        if (!songs.length) return interaction.editReply('No results found.');

        let queue = queues.get(interaction.guildId);
        if (!queue) {
            queue = new GuildQueue(interaction.guildId, () => queues.delete(interaction.guildId));
            queues.set(interaction.guildId, queue);

            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });
            queue.setConnection(connection);
        }

        if (songs.length === 1) {
            const positionBefore = queue.songs.length;
            log.music(`Enqueued ${log.bold(songs[0].title)} ${log.gray(`by ${interaction.user.tag}`)}`);
            await queue.add(songs[0]);
            const song = songs[0];
            const isFirst = positionBefore === 0;
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(isFirst ? '🎵 Now Playing' : '➕ Added to Queue')
                .setDescription(`**${song.title}**`)
                .addFields(
                    { name: 'Duration', value: song.duration, inline: true },
                    { name: 'Requested by', value: song.requestedBy, inline: true },
                    { name: 'Position', value: isFirst ? 'Now' : `#${positionBefore + 1}`, inline: true }
                );
            return interaction.editReply({ embeds: [embed] });
        }

        queue.addMany(songs);
        const embed = new EmbedBuilder()
            .setColor(0x1DB954)
            .setTitle('📋 Playlist Queued')
            .setDescription(`**${playlistName ?? 'Playlist'}** — ${songs.length} songs added`)
            .addFields({ name: 'Requested by', value: interaction.user.tag, inline: true });
        return interaction.editReply({ embeds: [embed] });
    }
};
