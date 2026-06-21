import { joinVoiceChannel } from "@discordjs/voice";
import { GuildQueue, queues } from "./guildQueue.js";

// Get the guild's queue, creating it and joining the voice channel if needed.
export function getOrCreateQueue(interaction, voiceChannel) {
    let queue = queues.get(interaction.guildId);
    if (queue) return queue;

    queue = new GuildQueue(interaction.guildId, () => queues.delete(interaction.guildId));
    queues.set(interaction.guildId, queue);
    queue.setConnection(joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
    }));
    return queue;
}

// Add resolved songs to the queue. Returns a tagged result the command renders:
//   { kind: "duplicate", song, position }   single track already queued
//   { kind: "single",    song, isFirst, position }
//   { kind: "many",      count, playlistName }
export function enqueue(queue, songs, playlistName) {
    if (songs.length === 1) {
        const song = songs[0];
        // Only dedup on a real URL — Spotify tracks carry url=null until resolved.
        const dupePos = song.url ? queue.songs.findIndex((s) => s.url === song.url) : -1;
        if (dupePos >= 0) return { kind: "duplicate", song, position: dupePos + 1 };

        const position = queue.songs.length;
        queue.add(song);
        return { kind: "single", song, isFirst: position === 0, position: position + 1 };
    }

    queue.addMany(songs);
    return { kind: "many", count: songs.length, playlistName };
}
