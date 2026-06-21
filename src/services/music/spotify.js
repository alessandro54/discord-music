import { LIMITS } from "../../lib/constants.js";
import { formatMs } from "../../lib/utils.js";

// Spotify injects an optional locale segment (e.g. /intl-es/) before the type.
const TRACK_RE = /open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/;
const PLAYLIST_RE = /open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]+)/;
const ALBUM_RE = /open\.spotify\.com\/(?:intl-[a-z]+\/)?album\/([A-Za-z0-9]+)/;

const spotifyToken = {
    value: null,
    expiry: 0,
    async get() {
        if (this.value && Date.now() < this.expiry) return this.value;
        const res = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${btoa(`${Deno.env.get("SPOTIFY_CLIENT_ID")}:${Deno.env.get("SPOTIFY_CLIENT_SECRET")}`)}`,
            },
            body: "grant_type=client_credentials",
        });
        const data = await res.json();
        if (!data.access_token)
            throw new Error(`Spotify token error: ${JSON.stringify(data)}`);
        this.value = data.access_token;
        this.expiry = Date.now() + (data.expires_in - 60) * 1000;
        return this.value;
    },
};

async function spotifyFetch(path) {
    const token = await spotifyToken.get();
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
}

function trackToSong(track, requestedBy, requestedById) {
    return {
        title: `${track.name} — ${track.artists[0].name}`,
        url: null,
        duration: formatMs(track.duration_ms),
        requestedBy,
        requestedById,
        spotifyTrack: { name: track.name, artists: track.artists },
    };
}

export async function resolveSpotify(url, requestedBy, requestedById) {
    const trackMatch = url.match(TRACK_RE);
    if (trackMatch) {
        const track = await spotifyFetch(`/tracks/${trackMatch[1]}`);
        return { songs: [trackToSong(track, requestedBy, requestedById)], playlistName: null };
    }

    const playlistMatch = url.match(PLAYLIST_RE);
    if (playlistMatch) {
        const playlist = await spotifyFetch(
            `/playlists/${playlistMatch[1]}?fields=name,tracks.items(track(name,duration_ms,artists)),tracks.total`,
        );
        const songs = playlist.tracks.items
            .filter((i) => i.track)
            .slice(0, LIMITS.PLAYLIST_MAX)
            .map((i) => trackToSong(i.track, requestedBy, requestedById));
        return { songs, playlistName: playlist.name };
    }

    const albumMatch = url.match(ALBUM_RE);
    if (albumMatch) {
        const album = await spotifyFetch(
            `/albums/${albumMatch[1]}/tracks?limit=50`,
        );
        const albumInfo = await spotifyFetch(
            `/albums/${albumMatch[1]}?fields=name`,
        );
        const songs = album.items
            .slice(0, LIMITS.PLAYLIST_MAX)
            .map((t) => trackToSong(t, requestedBy, requestedById));
        return { songs, playlistName: albumInfo.name };
    }

    throw new Error("Unsupported Spotify URL");
}

export async function getTrackMeta(url) {
    const match = url.match(TRACK_RE);
    if (!match) return null;
    const track = await spotifyFetch(`/tracks/${match[1]}`);
    return {
        title: `${track.name} — ${track.artists[0].name}`,
        duration: formatMs(track.duration_ms),
    };
}

export function isSpotifyUrl(url) {
    return TRACK_RE.test(url) || PLAYLIST_RE.test(url) || ALBUM_RE.test(url);
}
