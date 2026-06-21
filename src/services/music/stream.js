import { Readable } from "node:stream";
import { createAudioResource, StreamType } from "@discordjs/voice";
import { Innertube } from "youtubei.js";
import { log } from "../../lib/logger.js";

const YTDLP = Deno.env.get("YTDLP_PATH") || `${import.meta.dirname}/yt-dlp`;

let COOKIES_ARGS = [];
const cookies = Deno.env.get("YOUTUBE_COOKIES");
if (cookies) {
    try {
        Deno.writeTextFileSync("/tmp/yt-cookies.txt", cookies);
        COOKIES_ARGS = ["--cookies", "/tmp/yt-cookies.txt"];
        log.info("[stream] YouTube cookies loaded");
    } catch (err) {
        log.error(`[stream] Failed to write cookies: ${err.message}`);
    }
}

let CACHE_ARGS = [];
try {
    Deno.mkdirSync("/data/ytdlp-cache", { recursive: true });
    CACHE_ARGS = ["--cache-dir", "/data/ytdlp-cache"];
} catch { /* /data not available in local dev */ }

const AUDIO_FMT = "bestaudio[ext=webm][acodec=opus]/bestaudio[ext=opus]/bestaudio";
const dec = new TextDecoder();

let _yt = null;
async function getInnertube() {
    if (_yt) return _yt;
    _yt = await Innertube.create({ retrieve_player: false, generate_session_locally: true });
    return _yt;
}

function extractVideoId(url) {
    return url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
}

// Derive a cover image from the video id — always exists, no extra API call.
function ytThumb(videoId) {
    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

function fmtSecs(s) {
    s = Math.floor(s);
    const m = Math.floor(s / 60), h = Math.floor(m / 60);
    return h > 0
        ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
        : `${m}:${String(s % 60).padStart(2, "0")}`;
}

export async function fetchVideoInfo(url) {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("invalid YouTube URL");
    const yt = await getInnertube();
    const info = await yt.getBasicInfo(videoId);
    const title = info.basic_info?.title;
    if (!title) throw new Error("incomplete video info");
    return { title, url, duration: fmtSecs(info.basic_info?.duration ?? 0), thumbnail: ytThumb(videoId) };
}

export async function searchVideos(query, limit = 5) {
    const yt = await getInnertube();
    const results = await yt.search(query, { type: "video" });
    return (results.videos ?? []).slice(0, limit).map((video) => ({
        title: String(video.title?.text ?? video.title ?? query),
        url: `https://www.youtube.com/watch?v=${video.id}`,
        duration: video.duration?.text ?? fmtSecs(video.duration?.seconds ?? 0),
        thumbnail: video.thumbnails?.[0]?.url ?? ytThumb(video.id),
    }));
}

export async function searchVideo(query) {
    const [first] = await searchVideos(query, 1);
    if (!first) throw new Error(`no results for "${query}"`);
    return first;
}

export async function fetchPlaylistItems(url, limit) {
    const { code, stdout, stderr } = await new Deno.Command(YTDLP, {
        args: [
            "--flat-playlist", "--dump-json", "--quiet", "--no-warnings", ...COOKIES_ARGS, ...CACHE_ARGS,
            "--playlist-end", String(limit),
            url,
        ],
        stdout: "piped",
        stderr: "piped",
    }).output();
    const out = dec.decode(stdout);
    if (code !== 0 && !out.trim()) throw new Error(`yt-dlp playlist failed (${code}): ${dec.decode(stderr).trim()}`);
    return out.trim().split("\n").filter(Boolean).map((line) => {
        try {
            const v = JSON.parse(line);
            return {
                title: v.title,
                url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
                duration: fmtSecs(v.duration || 0),
                thumbnail: ytThumb(v.id),
            };
        } catch { return null; }
    }).filter(Boolean);
}

export async function createStream(url, seekSeconds = 0) {
    return _ytdlpStream(url, seekSeconds);
}

// Tear down a resource and reap its child procs. SIGTERM first so yt-dlp can
// propagate the signal to any ffmpeg child it spawned (--download-sections),
// then SIGKILL if it hasn't exited. Awaiting .status reaps the process and
// releases its stdio pipes — without this, killed procs leak as zombies.
export async function destroyResource(resource) {
    if (!resource) return;
    // Close the output stream so child stdout pipes receive EOF.
    try {
        resource.playStream?.destroy();
    } catch { /* already gone */ }

    await Promise.all((resource._procs ?? []).map(async (proc) => {
        try {
            proc.kill("SIGTERM");
        } catch { /* already exited */ }
        const exited = await Promise.race([
            proc.status.then(() => true).catch(() => true),
            new Promise((r) => setTimeout(() => r(false), 2000)),
        ]);
        if (!exited) {
            try {
                proc.kill("SIGKILL");
            } catch { /* race: exited between checks */ }
            try {
                await proc.status;
            } catch { /* already reaped */ }
        }
    }));
}

function _ytdlpStream(url, seekSeconds) {
    const args = [
        "--no-playlist", "-o", "-", "--quiet", "--no-warnings", "--no-check-formats",
        // Transient googlevideo 403s: retry the download and re-run the
        // extractor (fresh media URL) before giving up on the track.
        "--retries", "5", "--fragment-retries", "5", "--extractor-retries", "3",
        // Fail a dead/stalled connection fast instead of hanging the stream.
        "--socket-timeout", "15",
        ...COOKIES_ARGS, ...CACHE_ARGS,
    ];

    if (seekSeconds > 0) {
        args.push(
            "-f", "bestaudio/best",
            "--download-sections", `*${seekSeconds}-inf`,
            "--force-keyframes-at-cuts",
        );
    } else {
        args.push("-f", AUDIO_FMT);
    }

    args.push(url);

    const ytdlp = new Deno.Command(YTDLP, { args, stdout: "piped", stderr: "piped" }).spawn();
    (async () => {
        for await (const chunk of ytdlp.stderr) {
            const msg = dec.decode(chunk).trim();
            if (msg) log.error(`[yt-dlp] ${msg}`);
        }
    })();

    if (seekSeconds > 0) {
        const ffmpeg = new Deno.Command("ffmpeg", {
            args: [
                "-threads", "1", "-i", "pipe:0",
                "-vn", "-acodec", "libopus", "-b:a", "96k",
                "-ar", "48000", "-ac", "2", "-f", "opus", "pipe:1",
            ],
            stdin: "piped",
            stdout: "piped",
            stderr: "null",
        }).spawn();
        ytdlp.stdout.pipeTo(ffmpeg.stdin).catch(() => {});
        const resource = createAudioResource(Readable.fromWeb(ffmpeg.stdout), { inputType: StreamType.Arbitrary });
        resource._procs = [ytdlp, ffmpeg];
        return resource;
    }

    const resource = createAudioResource(Readable.fromWeb(ytdlp.stdout), { inputType: StreamType.WebmOpus });
    resource._procs = [ytdlp];
    return resource;
}
