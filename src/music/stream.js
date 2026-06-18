import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createAudioResource, StreamType } from "@discordjs/voice";
import { log } from "../lib/logger.js";

const YTDLP = process.env.YTDLP_PATH || join(dirname(process.argv[1]), "yt-dlp");
const YTDLP_FAST = ["--no-check-formats"];

const COOKIES_PATH = "/tmp/yt-cookies.txt";
let COOKIES_ARGS = [];
if (process.env.YOUTUBE_COOKIES) {
    try {
        writeFileSync(COOKIES_PATH, process.env.YOUTUBE_COOKIES);
        COOKIES_ARGS = ["--cookies", COOKIES_PATH];
        log.info("[stream] YouTube cookies loaded");
    } catch (err) {
        log.error(`[stream] Failed to write cookies: ${err.message}`);
    }
}
const AUDIO_FMT = "bestaudio[ext=webm][acodec=opus]/bestaudio[ext=opus]/bestaudio";
const URL_TTL = 4 * 60 * 60 * 1000; // 4h

const urlCache = new Map(); // videoId → { streamUrl, expiresAt }

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

// single yt-dlp spawn → title + duration + stream URL
export function fetchVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP, [
            "--no-playlist", "--quiet", "--no-warnings", ...YTDLP_FAST, ...COOKIES_ARGS,
            "-f", AUDIO_FMT,
            "--print", "title",
            "--print", "duration",
            "--print", "url",
            url,
        ]);
        let out = "", err = "";
        proc.stdout.on("data", (d) => { out += d; });
        proc.stderr.on("data", (d) => { err += d; });
        proc.on("close", (code) => {
            if (code !== 0) return reject(new Error(`yt-dlp failed (${code}): ${err.trim()}`));
            const [title, durStr, streamUrl] = out.trim().split("\n");
            if (!title || !streamUrl) return reject(new Error("incomplete yt-dlp output"));
            const duration = fmtSecs(parseInt(durStr, 10) || 0);
            const videoId = extractVideoId(url);
            if (videoId && streamUrl) {
                urlCache.set(videoId, { streamUrl, expiresAt: Date.now() + URL_TTL });
            }
            resolve({ title, url, duration, streamUrl });
        });
        proc.on("error", reject);
    });
}

// warm URL cache for next song (one spawn in background)
export function warmUrlCache(url) {
    const videoId = extractVideoId(url);
    if (!videoId) return;
    const cached = urlCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) return;
    fetchVideoInfo(url).catch(() => {});
}

// search YouTube and return first result with stream URL cached
export function searchVideo(query) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP, [
            "--no-playlist", "--quiet", "--no-warnings", ...YTDLP_FAST, ...COOKIES_ARGS,
            "-f", AUDIO_FMT,
            "--print", "title",
            "--print", "duration",
            "--print", "webpage_url",
            "--print", "url",
            `ytsearch1:${query}`,
        ]);
        let out = "", err = "";
        proc.stdout.on("data", (d) => { out += d; });
        proc.stderr.on("data", (d) => { err += d; });
        proc.on("close", (code) => {
            if (code !== 0) return reject(new Error(`yt-dlp search failed (${code}): ${err.trim()}`));
            const [title, durStr, webpageUrl, streamUrl] = out.trim().split("\n");
            if (!title || !webpageUrl) return reject(new Error("incomplete yt-dlp output"));
            const duration = fmtSecs(parseInt(durStr, 10) || 0);
            const videoId = extractVideoId(webpageUrl);
            if (videoId && streamUrl) {
                urlCache.set(videoId, { streamUrl, expiresAt: Date.now() + URL_TTL });
            }
            resolve({ title, url: webpageUrl, duration });
        });
        proc.on("error", reject);
    });
}

// fetch playlist items via yt-dlp flat extraction
export function fetchPlaylistItems(url, limit) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP, [
            "--flat-playlist", "--dump-json", "--quiet", "--no-warnings", ...COOKIES_ARGS,
            "--playlist-end", String(limit),
            url,
        ]);
        let out = "", err = "";
        proc.stdout.on("data", (d) => { out += d; });
        proc.stderr.on("data", (d) => { err += d; });
        proc.on("close", (code) => {
            if (code !== 0 && !out.trim()) return reject(new Error(`yt-dlp playlist failed (${code}): ${err.trim()}`));
            const items = out.trim().split("\n").filter(Boolean).map((line) => {
                try {
                    const v = JSON.parse(line);
                    return {
                        title: v.title,
                        url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
                        duration: fmtSecs(v.duration || 0),
                    };
                } catch { return null; }
            }).filter(Boolean);
            resolve(items);
        });
        proc.on("error", reject);
    });
}

export async function createStream(url, seekSeconds = 0) {
    if (seekSeconds > 0) return _ytdlpStream(url, seekSeconds);

    const videoId = extractVideoId(url);
    if (videoId) {
        const cached = urlCache.get(videoId);
        if (cached && cached.expiresAt > Date.now()) {
            try {
                return _ffmpegUrl(cached.streamUrl);
            } catch (err) {
                log.warn(`[stream] cached url failed — falling back`);
                urlCache.delete(videoId);
            }
        }
    }

    return _ytdlpStream(url, 0);
}

function _ffmpegUrl(streamUrl) {
    const ffmpeg = spawn("ffmpeg", [
        "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
        "-i", streamUrl,
        "-vn", "-acodec", "libopus", "-b:a", "96k", "-ar", "48000", "-ac", "2",
        "-f", "opus", "pipe:1",
    ]);
    ffmpeg.stderr.on("data", () => {});
    ffmpeg.on("error", (err) => log.error(`[ffmpeg url] ${err.message}`));
    ffmpeg.stdin.on("error", () => {});
    const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Arbitrary });
    resource._procs = [ffmpeg];
    return resource;
}

function _ytdlpStream(url, seekSeconds) {
    const args = ["--no-playlist", "-o", "-", "--quiet", "--no-warnings", ...YTDLP_FAST, ...COOKIES_ARGS];

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

    const ytdlp = spawn(YTDLP, args);
    ytdlp.on("error", (err) => log.error(`[yt-dlp spawn] ${err.message}`));
    ytdlp.stderr.on("data", (d) => {
        const msg = d.toString().trim();
        if (msg) log.error(`[yt-dlp] ${msg}`);
    });

    if (seekSeconds > 0) {
        const ffmpeg = spawn("ffmpeg", [
            "-threads", "1", "-i", "pipe:0",
            "-vn", "-acodec", "libopus", "-b:a", "96k",
            "-ar", "48000", "-ac", "2", "-f", "opus", "pipe:1",
        ]);
        ytdlp.stdout.pipe(ffmpeg.stdin);
        ytdlp.stdout.on("error", () => {});
        ffmpeg.stdin.on("error", () => {});
        ffmpeg.stderr.on("data", () => {});
        ffmpeg.on("error", (err) => log.error(`[ffmpeg spawn] ${err.message}`));
        const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Arbitrary });
        resource._procs = [ytdlp, ffmpeg];
        return resource;
    }

    ytdlp.stdout.on("error", () => {});
    const resource = createAudioResource(ytdlp.stdout, { inputType: StreamType.WebmOpus });
    resource._procs = [ytdlp];
    return resource;
}
