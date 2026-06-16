import { AudioPlayerStatus } from "@discordjs/voice";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    SlashCommandBuilder,
} from "discord.js";
import { embed } from "../lib/embeds.js";
import { requirePlaying } from "../music/guards.js";
import { durationToMs, formatMs, progressBar } from "../music/utils.js";

export function buildNpComponents(queue) {
    const isPaused = queue.player.state.status === AudioPlayerStatus.Paused;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("np:pause")
            .setEmoji(isPaused ? "▶️" : "⏸️")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("np:skip")
            .setEmoji("⏭️")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("np:stop")
            .setEmoji("⏹️")
            .setStyle(ButtonStyle.Danger),
    );
}

export function buildNpEmbed(queue) {
    const song = queue.current;
    const elapsedMs =
        (queue.resource?.playbackDuration ?? 0) + queue.seekOffset * 1000;
    const totalMs = durationToMs(song.duration);

    const progressLine = totalMs
        ? `${progressBar(elapsedMs, totalMs)}\n\`${formatMs(elapsedMs)} / ${song.duration}\``
        : `\`${formatMs(elapsedMs)} elapsed\``;

    return embed()
        .setTitle("🎵 Now Playing")
        .setDescription(`**${song.title}**\n\n${progressLine}`)
        .addFields(
            { name: "Requested by", value: song.requestedBy, inline: true },
            {
                name: "Up next",
                value: queue.songs[1]?.title ?? "Nothing",
                inline: true,
            },
        );
}

export default {
    data: new SlashCommandBuilder()
        .setName("np")
        .setDescription("Show the currently playing song"),
    async execute(interaction) {
        const queue = requirePlaying(interaction);
        if (!queue?.current) return;
        await interaction.reply({
            embeds: [buildNpEmbed(queue)],
            components: [buildNpComponents(queue)],
        });
    },
};
