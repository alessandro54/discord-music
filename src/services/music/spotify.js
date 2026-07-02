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

// Playlist track content requires a user-authorized token — Spotify's Client
// Credentials flow (used for tracks/albums below) can no longer read it.
// Refresh token comes from a one-time login: `deno task spotify-auth`.
const spotifyUserToken = {
    value: null,
    expiry: 0,
    async get() {
        if (this.value && Date.now() < this.expiry) return this.value;
        const refreshToken = Deno.env.get("SPOTIFY_REFRESH_TOKEN");
        if (!refreshToken) {
            throw new Error(
                "SPOTIFY_REFRESH_TOKEN not set — playlists need a user-authorized token. Run `deno task spotify-auth`.",
            );
        }
        const res = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${btoa(`${Deno.env.get("SPOTIFY_CLIENT_ID")}:${Deno.env.get("SPOTIFY_CLIENT_SECRET")}`)}`,
            },
            body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
        });
        const data = await res.json();
        if (!data.access_token)
            throw new Error(`Spotify refresh error: ${JSON.stringify(data)}`);
        this.value = data.access_token;
        this.expiry = Date.now() + (data.expires_in - 60) * 1000;
        return this.value;
    },
};

async function spotifyFetch(path, { userAuth = false } = {}) {
    const token = await (userAuth ? spotifyUserToken.get() : spotifyToken.get());
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.error) {
        throw new Error(
            `Spotify API error (${data.error.status ?? res.status}): ${data.error.message ?? "unknown"}`,
        );
    }
    return data;
}

function trackToSong(track, requestedBy, requestedById, art) {
    return {
        title: `${track.name} — ${track.artists[0].name}`,
        url: null,
        duration: formatMs(track.duration_ms),
        // Spotify album cover — kept through the YouTube resolution in _playNext.
        thumbnail: art ?? track.album?.images?.[0]?.url ?? null,
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
        // Playlist name/art is public catalog data (client-credentials is fine);
        // the track listing itself needs a user-authorized token, and even then
        // only for playlists Spotify considers this app authorized to read
        // (in practice: playlists owned by the account behind the refresh token —
        // Spotify's Development Mode blocks reading other users' playlists).
        const meta = await spotifyFetch(`/playlists/${playlistMatch[1]}?fields=name`);
        let items;
        try {
            items = await spotifyFetch(
                `/playlists/${playlistMatch[1]}/items?limit=${LIMITS.PLAYLIST_MAX}&fields=items(item(name,duration_ms,artists,album(images),track))`,
                { userAuth: true },
            );
        } catch (err) {
            if (err.message.includes("403")) {
                throw new Error(
                    "Can't read this playlist — Spotify only allows this bot to read playlists owned by its connected account. Try a track or album link, or a YouTube playlist instead.",
                );
            }
            throw err;
        }
        const songs = items.items
            .filter((i) => i.item?.track)
            .map((i) => trackToSong(i.item, requestedBy, requestedById));
        return { songs, playlistName: meta.name };
    }

    const albumMatch = url.match(ALBUM_RE);
    if (albumMatch) {
        const album = await spotifyFetch(
            `/albums/${albumMatch[1]}/tracks?limit=50`,
        );
        const albumInfo = await spotifyFetch(
            `/albums/${albumMatch[1]}?fields=name,images`,
        );
        // Album-track objects carry no album field — use the album's own cover.
        const art = albumInfo.images?.[0]?.url;
        const songs = album.items
            .slice(0, LIMITS.PLAYLIST_MAX)
            .map((t) => trackToSong(t, requestedBy, requestedById, art));
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
