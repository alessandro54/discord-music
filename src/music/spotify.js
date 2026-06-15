const TRACK_RE = /open\.spotify\.com\/track\/([A-Za-z0-9]+)/;
const PLAYLIST_RE = /open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/;
const ALBUM_RE = /open\.spotify\.com\/album\/([A-Za-z0-9]+)/;

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
    if (_token && Date.now() < _tokenExpiry) return _token;

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(
                `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
            ).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
    });

    const data = await res.json();
    if (!data.access_token) throw new Error(`Spotify token error: ${JSON.stringify(data)}`);
    _token = data.access_token;
    _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return _token;
}

async function spotifyFetch(path) {
    const token = await getToken();
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
}

function formatMs(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function trackToSong(track, requestedBy) {
    return {
        title: `${track.name} — ${track.artists[0].name}`,
        url: null,
        duration: formatMs(track.duration_ms),
        requestedBy,
        spotifyTrack: { name: track.name, artists: track.artists },
    };
}

export async function resolveSpotify(url, requestedBy) {
    let match;

    if ((match = url.match(TRACK_RE))) {
        const track = await spotifyFetch(`/tracks/${match[1]}`);
        return { songs: [trackToSong(track, requestedBy)], playlistName: null };
    }

    if ((match = url.match(PLAYLIST_RE))) {
        const playlist = await spotifyFetch(`/playlists/${match[1]}?fields=name,tracks.items(track(name,duration_ms,artists)),tracks.total`);
        const songs = playlist.tracks.items
            .filter(i => i.track)
            .slice(0, 100)
            .map(i => trackToSong(i.track, requestedBy));
        return { songs, playlistName: playlist.name };
    }

    if ((match = url.match(ALBUM_RE))) {
        const album = await spotifyFetch(`/albums/${match[1]}/tracks?limit=50`);
        const albumInfo = await spotifyFetch(`/albums/${match[1]}?fields=name`);
        const songs = album.items.slice(0, 100).map(t => trackToSong(t, requestedBy));
        return { songs, playlistName: albumInfo.name };
    }

    throw new Error('Unsupported Spotify URL');
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
