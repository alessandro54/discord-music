import { createAudioPlayer, AudioPlayerStatus, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import { YouTube } from 'youtube-sr';
import { createStream } from './stream.js';
import { log } from '../logger.js';
import { saveSong } from '../db.js';

export class GuildQueue {
    constructor(guildId, onDestroy) {
        this.guildId = guildId;
        this._onDestroy = onDestroy;
        this.songs = [];
        this.connection = null;
        this.player = createAudioPlayer();
        this.playing = false;
        this._idleTimeout = null;
        this.resource = null;
        this.seekOffset = 0;

        this.player.on(AudioPlayerStatus.Idle, () => {
            this._killStream();
            this.seekOffset = 0;
            this.songs.shift();
            if (this.songs.length > 0) {
                this._playNext();
            } else {
                this.playing = false;
                log.music(`Queue empty in guild ${this.guildId}`);
                this._idleTimeout = setTimeout(() => this.destroy(), 30_000);
            }
        });

        this.player.on('error', err => {
            console.error(`[Queue ${this.guildId}] Player error:`, err.message);
            this._killStream();
            this.songs.shift();
            if (this.songs.length > 0) this._playNext();
            else this.playing = false;
        });
    }

    setConnection(connection) {
        this.connection = connection;
        connection.subscribe(this.player);
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                this.destroy();
            }
        });
        connection.on('error', err => console.error(`[VoiceConnection ${this.guildId}]`, err.message));
    }

    get current() {
        return this.songs[0] ?? null;
    }

    _killStream() {
        for (const proc of this.resource?._procs ?? []) {
            try { proc.kill(); } catch {}
        }
        this.resource = null;
    }

    async add(song) {
        clearTimeout(this._idleTimeout);
        this.songs.push(song);
        if (!this.playing) await this._playNext();
    }

    addMany(songs) {
        clearTimeout(this._idleTimeout);
        const wasEmpty = this.songs.length === 0;
        this.songs.push(...songs);
        if (!this.playing && wasEmpty) this._playNext();
    }

    async _playNext() {
        let song = this.songs[0];
        if (!song) return;

        if (song.spotifyTrack) {
            try {
                const { name, artists } = song.spotifyTrack;
                const results = await YouTube.search(`${name} ${artists[0].name}`, { limit: 1, type: 'video' });
                if (!results.length) throw new Error('No YouTube result');
                song = { ...song, url: results[0].url, spotifyTrack: null };
                this.songs[0] = song;
            } catch {
                console.error(`[Queue ${this.guildId}] Could not resolve Spotify track: ${song.title}`);
                this.songs.shift();
                if (this.songs.length > 0) await this._playNext();
                else this.playing = false;
                return;
            }
        }

        try {
            const resource = createStream(song.url, this.seekOffset);
            this.resource = resource;
            this.player.play(resource);
            this.playing = true;
            log.music(`${log.bold(song.title)} ${log.gray(`· ${song.duration} · by ${song.requestedBy}`)}`);
            saveSong({
                guildId: this.guildId,
                userId: song.requestedById,
                userTag: song.requestedBy,
                title: song.title,
                url: song.url,
                duration: song.duration,
            });
        } catch (err) {
            log.error(`[Queue ${this.guildId}] Stream: ${err.message}`);
            this.songs.shift();
            if (this.songs.length > 0) await this._playNext();
            else this.playing = false;
        }
    }

    async seek(seconds) {
        if (!this.current?.url) return false;
        this._killStream();
        this.seekOffset = seconds;
        try {
            const resource = createStream(this.current.url, seconds);
            this.resource = resource;
            this.player.play(resource);
            return true;
        } catch (err) {
            console.error(`[Queue ${this.guildId}] Seek error:`, err.message);
            return false;
        }
    }

    skip() {
        this._killStream();
        this.seekOffset = 0;
        this.player.stop();
    }

    stop() {
        this.songs = [];
        this.playing = false;
        this._killStream();
        this.player.stop();
        this.destroy();
    }

    pause() {
        this.player.pause();
    }

    resume() {
        this.player.unpause();
    }

    destroy() {
        clearTimeout(this._idleTimeout);
        this._killStream();
        this.connection?.destroy();
        this.connection = null;
        this.playing = false;
        this._onDestroy?.();
    }
}
