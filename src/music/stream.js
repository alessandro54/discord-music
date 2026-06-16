import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { createAudioResource, StreamType } from "@discordjs/voice";
import { log } from "../lib/logger.js";

const YTDLP = process.env.YTDLP_PATH || join(dirname(process.argv[1]), "yt-dlp");
const YTDLP_FAST = ["--no-check-formats", "--extractor-args", "youtube:skip=dash,hls"];
const URL_TTL = 4 * 60 * 60 * 1000; // 4h — YouTube pre-signed URLs last ~6h

const urlCache = new Map(); // videoId → { streamUrl, expiresAt }

function extractVideoId(url) {
    return url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
}

function ytdlpGetUrl(url) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP, [
            "--no-playlist", "--quiet", "--no-warnings", ...YTDLP_FAST,
            "-f", "bestaudio[ext=webm][acodec=opus]/bestaudio[ext=opus]/bestaudio",
            "--get-url", url,
        ]);
        let out = "", err = "";
        proc.stdout.on("data", (d) => { out += d; });
        proc.stderr.on("data", (d) => { err += d; });
        proc.on("close", (code) => {
            if (code !== 0) return reject(new Error(`yt-dlp get-url failed (${code}): ${err.trim()}`));
            const streamUrl = out.trim().split("\n")[0];
            if (!streamUrl) return reject(new Error("no url returned"));
            resolve(streamUrl);
        });
        proc.on("error", reject);
    });
}

// warm URL cache at submit time (single spawn, not during autocomplete)
export function warmUrlCache(url) {
    const videoId = extractVideoId(url);
    if (!videoId) return;
    const cached = urlCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) return;
    ytdlpGetUrl(url)
        .then((streamUrl) => urlCache.set(videoId, { streamUrl, expiresAt: Date.now() + URL_TTL }))
        .catch(() => {});
}

export function getYoutubeInfo(url) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP, ["--dump-json", "--no-playlist", "--quiet", ...YTDLP_FAST, url]);
        let data = "", errData = "";
        proc.stdout.on("data", (d) => { data += d; });
        proc.stderr.on("data", (d) => { errData += d; });
        proc.on("close", (code) => {
            if (code !== 0) return reject(new Error(`yt-dlp metadata failed (${code}): ${errData.trim()}`));
            try {
                const info = JSON.parse(data);
                const s = info.duration ?? 0;
                const m = Math.floor(s / 60);
                const h = Math.floor(m / 60);
                const duration = h > 0
                    ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
                    : `${m}:${String(s % 60).padStart(2, "0")}`;
                resolve({ title: info.title, url: info.webpage_url ?? url, duration });
            } catch {
                reject(new Error("Failed to parse yt-dlp output"));
            }
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
                log.warn(`[stream] cached url failed: ${err.message} — falling back`);
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
    const args = ["--no-playlist", "-o", "-", "--quiet", "--no-warnings", ...YTDLP_FAST];

    if (seekSeconds > 0) {
        args.push(
            "-f", "bestaudio/best",
            "--download-sections", `*${seekSeconds}-inf`,
            "--force-keyframes-at-cuts",
        );
    } else {
        args.push("-f", "bestaudio[ext=webm][acodec=opus]/bestaudio[ext=opus]/bestaudio");
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
