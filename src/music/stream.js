import { spawn } from "node:child_process";
import { createAudioResource, StreamType } from "@discordjs/voice";
import { log } from "../lib/logger.js";

const YTDLP = () => process.env.YTDLP_PATH || "yt-dlp";

export function getYoutubeInfo(url) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP(), ["--dump-json", "--no-playlist", "--quiet", url]);
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

export function createStream(url, seekSeconds = 0) {
    const ytdlpArgs = ["--no-playlist", "-o", "-", "--quiet", "--no-warnings"];

    if (seekSeconds > 0) {
        ytdlpArgs.push("-f", "bestaudio/best");
        ytdlpArgs.push(
            "--download-sections",
            `*${seekSeconds}-inf`,
            "--force-keyframes-at-cuts",
        );
    } else {
        ytdlpArgs.push(
            "-f",
            "bestaudio[ext=webm]/bestaudio[ext=opus]/bestaudio",
        );
    }

    ytdlpArgs.push(url);

    const ytdlp = spawn(YTDLP(), ytdlpArgs);
    ytdlp.on("error", (err) => log.error(`[yt-dlp spawn] ${err.message}`));
    ytdlp.stderr.on("data", (d) => {
        const msg = d.toString().trim();
        if (msg) log.error(`[yt-dlp] ${msg}`);
    });

    if (seekSeconds > 0) {
        const ffmpeg = spawn("ffmpeg", [
            "-threads",
            "1",
            "-i",
            "pipe:0",
            "-vn",
            "-acodec",
            "libopus",
            "-b:a",
            "96k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-f",
            "opus",
            "pipe:1",
        ]);
        ytdlp.stdout.pipe(ffmpeg.stdin);
        ytdlp.stdout.on("error", () => {});
        ffmpeg.stdin.on("error", () => {});
        ffmpeg.stderr.on("data", () => {});
        ffmpeg.on("error", (err) => log.error(`[ffmpeg spawn] ${err.message}`));
        const resource = createAudioResource(ffmpeg.stdout, {
            inputType: StreamType.Arbitrary,
        });
        resource._procs = [ytdlp, ffmpeg];
        return resource;
    }

    ytdlp.stdout.on("error", () => {});
    const resource = createAudioResource(ytdlp.stdout, {
        inputType: StreamType.WebmOpus,
    });
    resource._procs = [ytdlp];
    return resource;
}
