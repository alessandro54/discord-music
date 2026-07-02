// One-time OAuth flow to get a Spotify refresh token for playlist access.
//
// Spotify's Client Credentials flow (used elsewhere in this bot for tracks
// and albums) can no longer read playlist contents — that now requires a
// user-authorized token with the playlist-read scopes.
//
// Before running: add http://127.0.0.1:8888/callback as a Redirect URI on
// this app in the Spotify Developer Dashboard.
//
// Usage: deno task spotify-auth
// Then copy the printed SPOTIFY_REFRESH_TOKEN into .env (dev) and
// `dokku config:set` (prod).

const CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET");
const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SCOPE = "playlist-read-private playlist-read-collaborative";

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env first.");
    Deno.exit(1);
}

const state = crypto.randomUUID();
const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("state", state);

console.log("\n1. Make sure this redirect URI is registered on your Spotify app:");
console.log(`   ${REDIRECT_URI}\n`);
console.log("2. Open this URL, log in, and approve access:\n");
console.log(`   ${authUrl.toString()}\n`);
console.log("Waiting for callback on http://127.0.0.1:8888 ...");

let resolveResult;
const resultPromise = new Promise((resolve) => {
    resolveResult = resolve;
});

const server = Deno.serve({ port: 8888 }, (req) => {
    const url = new URL(req.url);
    if (url.pathname !== "/callback") return new Response("Not found", { status: 404 });

    const error = url.searchParams.get("error");
    if (error) {
        resolveResult({ error });
        return new Response(`Authorization failed: ${error}. You can close this tab.`);
    }

    const returnedState = url.searchParams.get("state");
    if (returnedState !== state) {
        resolveResult({ error: "state mismatch" });
        return new Response("State mismatch — possible CSRF. You can close this tab.", { status: 400 });
    }

    resolveResult({ code: url.searchParams.get("code") });
    return new Response("Authorized! You can close this tab and return to the terminal.");
});

const result = await resultPromise;
await server.shutdown();

if (result.error) {
    console.error(`\nFailed: ${result.error}`);
    Deno.exit(1);
}

const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
        grant_type: "authorization_code",
        code: result.code,
        redirect_uri: REDIRECT_URI,
    }),
});
const tokenData = await tokenRes.json();

if (!tokenData.refresh_token) {
    console.error("\nNo refresh_token in response:", tokenData);
    Deno.exit(1);
}

console.log("\nSuccess. Add this to .env (dev) and `dokku config:set` (prod):\n");
console.log(`SPOTIFY_REFRESH_TOKEN=${tokenData.refresh_token}\n`);
