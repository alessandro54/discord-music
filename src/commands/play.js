import { joinVoiceChannel } from "@discordjs/voice";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { COLORS, LIMITS } from "../lib/constants.js";
import { embed } from "../lib/embeds.js";
import { log } from "../lib/logger.js";
import { getHistory } from "../lib/db.js";
import { GuildQueue, queues } from "../music/guildQueue.js";
import {
    getTrackMeta,
    isSpotifyUrl,
    resolveSpotify,
} from "../music/spotify.js";
import { fetchVideoInfo, searchVideo, fetchPlaylistItems } from "../music/stream.js";

const YOUTUBE_RE = /(?:youtube\.com|youtu\.be)/;
const YOUTUBE_LIST_RE = /[?&]list=/;

async function ytSuggest(query) {
    const res = await fetch(
        `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`
    );
    const data = await res.json();
    return (data[1] || []).slice(0, 5);
}

async function resolveSongs(query, requestedBy, requestedById) {
    if (isSpotifyUrl(query)) {
        return resolveSpotify(query, requestedBy, requestedById);
    }

    if (YOUTUBE_RE.test(query) && YOUTUBE_LIST_RE.test(query)) {
        const items = await fetchPlaylistItems(query, LIMITS.PLAYLIST_MAX);
        if (!items.length) throw new Error("Playlist not found or empty");
        return { songs: items.map((v) => ({ ...v, requestedBy, requestedById, spotifyTrack: null })), playlistName: null };
    }

    if (YOUTUBE_RE.test(query)) {
        const info = await fetchVideoInfo(query);
        return { songs: [{ title: info.title, url: info.url, duration: info.duration, requestedBy, requestedById, spotifyTrack: null }], playlistName: null };
    }

    const info = await searchVideo(query);
    return { songs: [{ title: info.title, url: info.url, duration: info.duration, requestedBy, requestedById, spotifyTrack: null }], playlistName: null };
}

export default {
    async autocomplete(interaction) {
        const query = interaction.options.getFocused();
        const respond = (items = []) => interaction.respond(items).catch(() => {});

        if (query.length < 2) {
            const recent = await getHistory(interaction.guildId, LIMITS.AUTOCOMPLETE_RESULTS);
            return respond(recent.map((s) => ({ name: s.title.slice(0, 100), value: s.url })));
        }

        const deadline = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500));

        try {
            if (isSpotifyUrl(query)) {
                const meta = await Promise.race([getTrackMeta(query), deadline]);
                if (meta) return respond([{ name: `${meta.title} (${meta.duration})`.slice(0, 100), value: query }]);
                return respond([{ name: "Spotify playlist/album — press Enter to queue", value: query }]);
            }

            if (YOUTUBE_RE.test(query)) return respond([]);

            const suggestions = await Promise.race([ytSuggest(query), deadline]);
            return respond(suggestions.map((s) => ({ name: s.slice(0, 100), value: s })));
        } catch (err) {
            if (err.message !== "timeout") log.error(`[autocomplete] ${err.message}`);
            const recent = await getHistory(interaction.guildId, LIMITS.AUTOCOMPLETE_RESULTS);
            return respond(recent.map((s) => ({ name: `↩ ${s.title}`.slice(0, 100), value: s.url })));
        }
    },
    data: new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a song or playlist from YouTube or Spotify")
        .addStringOption((o) =>
            o
                .setName("query")
                .setDescription("YouTube/Spotify URL or search query")
                .setRequired(true)
                .setAutocomplete(true),
        ),
    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: "Join a voice channel first.", flags: MessageFlags.Ephemeral });
        }

        const perms = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (
            !perms.has(PermissionFlagsBits.Connect) ||
            !perms.has(PermissionFlagsBits.Speak)
        ) {
            return interaction.reply({
                content: "I don't have permission to join or speak in that voice channel.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const query = interaction.options.getString("query");
        await interaction.reply({ content: `🔍 Searching for **${query}**…` });

        let resolved;
        try {
            resolved = await resolveSongs(
                query,
                interaction.user.tag,
                interaction.user.id,
            );
        } catch (err) {
            log.error(`[play] resolveSongs: ${err.message}`);
            return interaction.editReply("Could not find that song or playlist.");
        }

        const { songs, playlistName } = resolved;
        if (!songs.length) return interaction.editReply("No results found.");

        let queue = queues.get(interaction.guildId);
        if (!queue) {
            queue = new GuildQueue(interaction.guildId, () =>
                queues.delete(interaction.guildId),
            );
            queues.set(interaction.guildId, queue);

            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guildId,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });
            queue.setConnection(connection);
        }

        if (songs.length === 1) {
            const song = songs[0];
            const dupePos = queue.songs.findIndex((s) => s.url === song.url);
            if (dupePos >= 0) {
                return interaction.editReply(`**${song.title}** is already in the queue at position #${dupePos + 1}.`);
            }
            const positionBefore = queue.songs.length;
            const isFirst = positionBefore === 0;
            log.music(
                `Enqueued ${log.bold(song.title)} ${log.gray(`by ${interaction.user.tag}`)}`,
            );
            queue.add(song);
            const e = embed()
                .setTitle(isFirst ? "🎵 Now Playing" : "➕ Added to Queue")
                .setDescription(`**${song.title}**`)
                .addFields(
                    { name: "Duration", value: song.duration, inline: true },
                    { name: "Requested by", value: song.requestedBy, inline: true },
                    { name: "Position", value: isFirst ? "Now" : `#${positionBefore + 1}`, inline: true },
                );
            return interaction.editReply({ embeds: [e] });
        }

        queue.addMany(songs);
        const e = embed(COLORS.SPOTIFY)
            .setTitle("📋 Playlist Queued")
            .setDescription(`**${playlistName ?? "Playlist"}** — ${songs.length} songs added`)
            .addFields({ name: "Requested by", value: interaction.user.tag, inline: true });
        return interaction.editReply({ embeds: [e] });
    },
};
