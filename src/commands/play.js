import { joinVoiceChannel } from "@discordjs/voice";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
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
import { getYoutubeInfo } from "../music/stream.js";
const YOUTUBE_RE = /(?:youtube\.com|youtu\.be)/;

function songFrom(v, requestedBy, requestedById) {
    return {
        title: v.title,
        url: v.url,
        duration: v.duration?.timestamp ?? "?:??",
        requestedBy,
        requestedById,
        spotifyTrack: null,
    };
}

async function resolveSongs(query, requestedBy, requestedById) {
    if (isSpotifyUrl(query)) {
        return resolveSpotify(query, requestedBy, requestedById);
    }

    if (YOUTUBE_RE.test(query)) {
        const v = await YouTube.getVideo(query) ?? await getYoutubeInfo(query);
        return { songs: [songFrom(v, requestedBy, requestedById)], playlistName: null };
    }

    const results = await YouTube.search(query, { limit: 1, type: "video" });
    if (!results.length) return { songs: [], playlistName: null };
    return { songs: [songFrom(results[0], requestedBy, requestedById)], playlistName: null };
}

export default {
    async autocomplete(interaction) {
        const query = interaction.options.getFocused();
        if (query.length < 2) {
            const recent = await getHistory(interaction.guildId, LIMITS.AUTOCOMPLETE_RESULTS);
            return interaction.respond(
                recent.map((s) => ({ name: s.title.slice(0, 100), value: s.url })),
            );
        }

        try {
            if (isSpotifyUrl(query)) {
                const meta = await getTrackMeta(query);
                if (meta) {
                    return interaction.respond([
                        {
                            name: `${meta.title} (${meta.duration})`.slice(
                                0,
                                100,
                            ),
                            value: query,
                        },
                    ]);
                }
                return interaction.respond([
                    {
                        name: "Spotify playlist/album — press Enter to queue",
                        value: query,
                    },
                ]);
            }

            if (YOUTUBE_RE.test(query)) return interaction.respond([]);

            const results = await YouTube.search(query, {
                limit: LIMITS.AUTOCOMPLETE_RESULTS,
                type: "video",
            });
            await interaction.respond(
                results.map((v) => ({
                    name: v.title.slice(0, 100),
                    value: v.url,
                })),
            );
        } catch (err) {
            log.error(`[autocomplete] ${err.message}`);
            await interaction.respond([]);
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
            return interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
        }

        const perms = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (
            !perms.has(PermissionFlagsBits.Connect) ||
            !perms.has(PermissionFlagsBits.Speak)
        ) {
            return interaction.reply({
                content: "I don't have permission to join or speak in that voice channel.",
                ephemeral: true,
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
            return interaction.editReply(
                "Could not find that song or playlist.",
            );
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
            const positionBefore = queue.songs.length;
            log.music(
                `Enqueued ${log.bold(songs[0].title)} ${log.gray(`by ${interaction.user.tag}`)}`,
            );
            await queue.add(songs[0]);
            const song = songs[0];
            const isFirst = positionBefore === 0;
            const e = embed()
                .setTitle(isFirst ? "🎵 Now Playing" : "➕ Added to Queue")
                .setDescription(`**${song.title}**`)
                .addFields(
                    { name: "Duration", value: song.duration, inline: true },
                    {
                        name: "Requested by",
                        value: song.requestedBy,
                        inline: true,
                    },
                    {
                        name: "Position",
                        value: isFirst ? "Now" : `#${positionBefore + 1}`,
                        inline: true,
                    },
                );
            return interaction.editReply({ embeds: [e] });
        }

        queue.addMany(songs);
        const e = embed(COLORS.SPOTIFY)
            .setTitle("📋 Playlist Queued")
            .setDescription(
                `**${playlistName ?? "Playlist"}** — ${songs.length} songs added`,
            )
            .addFields({
                name: "Requested by",
                value: interaction.user.tag,
                inline: true,
            });
        return interaction.editReply({ embeds: [e] });
    },
};
