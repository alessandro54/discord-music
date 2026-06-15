export async function initPlayDl() {
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
        console.warn('[initPlayDl] Spotify credentials missing — Spotify support disabled');
    } else {
        console.log('[initPlayDl] Spotify credentials present');
    }
}
