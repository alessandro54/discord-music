import { Readable } from "node:stream";
import { createAudioResource, StreamType } from "@discordjs/voice";
import { log } from "../lib/logger.js";

const YTDLP = Deno.env.get("YTDLP_PATH") || `${import.meta.dirname}/yt-dlp`;

const COOKIES_PATH = "/tmp/yt-cookies.txt";
const ANDROID_ARGS = ["--extractor-args", "youtube:player_client=android"];
let COOKIES_ARGS = [];
const cookies = Deno.env.get("YOUTUBE_COOKIES");
if (cookies) {
    try {
        Deno.writeTextFileSync(COOKIES_PATH, cookies);
        COOKIES_ARGS = ["--cookies", COOKIES_PATH];
        log.info("[stream] YouTube cookies loaded");
    } catch (err) {
        log.error(`[stream] Failed to write cookies: ${err.message}`);
    }
}
// persist player JS cache to Fly volume so it survives restarts
let CACHE_ARGS = [];
try {
    Deno.mkdirSync("/data/ytdlp-cache", { recursive: true });
    CACHE_ARGS = ["--cache-dir", "/data/ytdlp-cache"];
} catch { /* /data not available in local dev — use default cache */ }

const AUDIO_FMT = "bestaudio[ext=webm][acodec=opus]/bestaudio[ext=opus]/bestaudio";
const URL_TTL = 4 * 60 * 60 * 1000; // 4h

const urlCache = new Map(); // videoId → { streamUrl, expiresAt }
const dec = new TextDecoder();

function extractVideoId(url) {
    return url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
}

function fmtSecs(s) {
    s = Math.floor(s);
    const m = Math.floor(s / 60), h = Math.floor(m / 60);
    return h > 0
        ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
        : `${m}:${String(s % 60).padStart(2, "0")}`;
}

// single yt-dlp spawn → title + duration only (no format resolution)
export async function fetchVideoInfo(url) {
    const { code, stdout, stderr } = await new Deno.Command(YTDLP, {
        args: [
            "--no-playlist", "--quiet", "--no-warnings", ...COOKIES_ARGS, ...CACHE_ARGS, ...ANDROID_ARGS,
            "--print", "title", "--print", "duration",
            url,
        ],
        stdout: "piped",
        stderr: "piped",
    }).output();
    if (code !== 0) throw new Error(`yt-dlp failed (${code}): ${dec.decode(stderr).trim()}`);
    const [title, durStr] = dec.decode(stdout).trim().split("\n");
    if (!title) throw new Error("incomplete yt-dlp output");
    const duration = fmtSecs(parseInt(durStr, 10) || 0);
    return { title, url, duration };
}

// search YouTube and return first result with stream URL cached
export async function searchVideo(query) {
    const { code, stdout, stderr } = await new Deno.Command(YTDLP, {
        args: [
            "--no-playlist", "--quiet", "--no-warnings", ...COOKIES_ARGS, ...CACHE_ARGS, ...ANDROID_ARGS,
            "-f", AUDIO_FMT, "--no-check-formats",
            "--print", "title", "--print", "duration", "--print", "webpage_url", "--print", "url",
            `ytsearch1:${query}`,
        ],
        stdout: "piped",
        stderr: "piped",
    }).output();
    if (code !== 0) throw new Error(`yt-dlp search failed (${code}): ${dec.decode(stderr).trim()}`);
    const [title, durStr, webpageUrl, streamUrl] = dec.decode(stdout).trim().split("\n");
    if (!title || !webpageUrl) throw new Error("incomplete yt-dlp output");
    const duration = fmtSecs(parseInt(durStr, 10) || 0);
    const videoId = extractVideoId(webpageUrl);
    if (videoId && streamUrl) {
        if (urlCache.size >= 100) urlCache.delete(urlCache.keys().next().value);
        urlCache.set(videoId, { streamUrl, expiresAt: Date.now() + URL_TTL });
    }
    return { title, url: webpageUrl, duration };
}

// fetch playlist items via yt-dlp flat extraction
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
            };
        } catch { return null; }
    }).filter(Boolean);
}

export async function createStream(url, seekSeconds = 0) {
    if (seekSeconds > 0) return _ytdlpStream(url, seekSeconds);

    const videoId = extractVideoId(url);
    if (videoId) {
        const cached = urlCache.get(videoId);
        if (cached && cached.expiresAt > Date.now()) {
            try {
                return _ffmpegUrl(cached.streamUrl);
            } catch {
                log.warn(`[stream] cached url failed — falling back`);
                urlCache.delete(videoId);
            }
        }
    }

    return _ytdlpStream(url, 0);
}

function _ffmpegUrl(streamUrl) {
    const ffmpeg = new Deno.Command("ffmpeg", {
        args: [
            "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
            "-i", streamUrl,
            "-vn", "-acodec", "libopus", "-b:a", "96k", "-ar", "48000", "-ac", "2",
            "-f", "opus", "pipe:1",
        ],
        stdout: "piped",
        stderr: "null",
    }).spawn();
    const resource = createAudioResource(Readable.fromWeb(ffmpeg.stdout), { inputType: StreamType.Arbitrary });
    resource._procs = [ffmpeg];
    return resource;
}

function _ytdlpStream(url, seekSeconds) {
    const args = ["--no-playlist", "-o", "-", "--quiet", "--no-warnings", "--no-check-formats", ...COOKIES_ARGS, ...CACHE_ARGS, ...ANDROID_ARGS];

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

