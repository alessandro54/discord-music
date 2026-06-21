import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { queues } from "../services/music/guildQueue.js";

export function requirePlaying(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue?.playing) {
        interaction.reply({ content: "Nothing playing.", flags: MessageFlags.Ephemeral });
        return null;
    }
    return queue;
}

// Returns the caller's voice channel if the bot can join+speak there,
// otherwise replies with the reason and returns null.
export function ensureVoice(interaction) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        interaction.reply({ content: "Join a voice channel first.", flags: MessageFlags.Ephemeral });
        return null;
    }
    const perms = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!perms.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) {
        interaction.reply({
            content: "I don't have permission to join or speak in that voice channel.",
            flags: MessageFlags.Ephemeral,
        });
        return null;
    }
    return voiceChannel;
}
