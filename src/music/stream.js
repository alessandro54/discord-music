import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { Readable } from "node:stream";
import { Innertube } from "youtubei.js";
import { createAudioResource, StreamType } from "@discordjs/voice";
import { log } from "../lib/logger.js";

const YTDLP = process.env.YTDLP_PATH || join(dirname(process.argv[1]), "yt-dlp");
const YTDLP_FAST = ["--no-check-formats", "--extractor-args", "youtube:skip=dash,hls"];
const INFO_TTL = 5 * 60 * 60 * 1000; // 5h — YouTube stream URLs expire in ~6h

let _yt = null;
async function getInnertube() {
    if (!_yt) _yt = await Innertube.create();
    return _yt;
}
getInnertube().catch(() => {});

const infoCache = new Map(); // videoId → { info, expiresAt }

async function getCachedInfo(videoId) {
    const hit = infoCache.get(videoId);
    if (hit && hit.expiresAt > Date.now()) return hit.info;
    const yt = await getInnertube();
    const info = await yt.getInfo(videoId);
    infoCache.set(videoId, { info, expiresAt: Date.now() + INFO_TTL });
    return info;
}

function extractVideoId(url) {
    return url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
}

export async function searchYoutube(query, limit = 5) {
    const yt = await getInnertube();
    const res = await yt.search(query, { type: "video" });
    return (res.videos ?? []).slice(0, limit).map((v) => ({
        title: v.title?.text ?? v.title ?? "Unknown",
        url: `https://www.youtube.com/watch?v=${v.id}`,
    }));
}

export function prefetchSong(url) {
    const videoId = extractVideoId(url);
    if (videoId) getCachedInfo(videoId).catch(() => {});
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
        try {
            const info = await getCachedInfo(videoId);
            const stream = await info.download({ type: "audio", quality: "best", format: "webm" });
            const resource = createAudioResource(Readable.fromWeb(stream), {
                inputType: StreamType.Arbitrary,
            });
            resource._procs = [];
            return resource;
        } catch (err) {
            log.warn(`[stream] innertube failed: ${err.message} — falling back to yt-dlp`);
            infoCache.delete(videoId);
        }
    }

    return _ytdlpStream(url, 0);
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
