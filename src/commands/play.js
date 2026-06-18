import { joinVoiceChannel } from "@discordjs/voice";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { YouTube } from "youtube-sr";
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
import { fetchVideoInfo, warmUrlCache } from "../music/stream.js";

const YOUTUBE_RE = /(?:youtube\.com|youtu\.be)/;
const YOUTUBE_LIST_RE = /[?&]list=/;

function fmtSeconds(s) {
    s = Math.floor(s);
    const m = Math.floor(s / 60), h = Math.floor(m / 60);
    return h > 0
        ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
        : `${m}:${String(s % 60).padStart(2, "0")}`;
}

function songFrom(v, requestedBy, requestedById) {
    const duration = v.duration?.timestamp
        ?? (v.duration?.seconds ? fmtSeconds(v.duration.seconds) : "?:??");
    return {
        title: v.title,
        url: v.url,
        duration,
        requestedBy,
        requestedById,
        spotifyTrack: null,
    };
}

async function resolveSongs(query, requestedBy, requestedById) {
    if (isSpotifyUrl(query)) {
        return resolveSpotify(query, requestedBy, requestedById);
    }

    if (YOUTUBE_RE.test(query) && YOUTUBE_LIST_RE.test(query)) {
        const playlist = await YouTube.getPlaylist(query);
        if (!playlist) throw new Error("Playlist not found");
        await playlist.fetch(LIMITS.PLAYLIST_MAX);
        const songs = playlist.videos
            .slice(0, LIMITS.PLAYLIST_MAX)
            .filter((v) => v.title && v.url)
            .map((v) => songFrom(v, requestedBy, requestedById));
        return { songs, playlistName: playlist.title };
    }

    if (YOUTUBE_RE.test(query)) {
        const info = await fetchVideoInfo(query); // single spawn: title + duration + caches stream URL
        return { songs: [{ title: info.title, url: info.url, duration: info.duration, requestedBy, requestedById, spotifyTrack: null }], playlistName: null };
    }

    const results = await YouTube.search(query, { limit: 1, type: "video" });
    if (!results.length) return { songs: [], playlistName: null };
    const hit = results[0];
    const song = songFrom(hit, requestedBy, requestedById);
    if (song.duration === "?:??" && hit.url) {
        fetchVideoInfo(hit.url).then((info) => { if (info?.duration) song.duration = info.duration; }).catch(() => {});
    }
    return { songs: [song], playlistName: null };
}

export default {
    async autocomplete(interaction) {
        const query = interaction.options.getFocused();
        const respond = (items = []) => interaction.respond(items).catch(() => {});

        if (query.length < 2) {
            const recent = await getHistory(interaction.guildId, LIMITS.AUTOCOMPLETE_RESULTS);
            respond(recent.map((s) => ({ name: s.title.slice(0, 100), value: s.url })));
            if (recent[0]) warmUrlCache(recent[0].url);
            return;
        }

        const deadline = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2800));

        try {
            if (isSpotifyUrl(query)) {
                const meta = await Promise.race([getTrackMeta(query), deadline]);
                if (meta) return respond([{ name: `${meta.title} (${meta.duration})`.slice(0, 100), value: query }]);
                return respond([{ name: "Spotify playlist/album — press Enter to queue", value: query }]);
            }

            if (YOUTUBE_RE.test(query)) return respond([]);

            const results = await Promise.race([
                YouTube.search(query, { limit: LIMITS.AUTOCOMPLETE_RESULTS, type: "video" }),
                deadline,
            ]);
            respond(results.map((v) => ({ name: (v.title ?? "").slice(0, 100), value: v.url })));
            results.slice(0, 2).forEach((v) => warmUrlCache(v.url));
            return;
        } catch (err) {
            if (err.message !== "timeout") log.error(`[autocomplete] ${err.message}`);
            return respond([]);
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
