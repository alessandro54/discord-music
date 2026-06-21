import { log } from "./logger.js";

let adapter;

async function initSqlite(path) {
    const { Database } = await import("@db/sqlite");
    const db = new Database(path);
    db.exec(`CREATE TABLE IF NOT EXISTS song_history (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id  TEXT NOT NULL,
        user_id   TEXT,
        user_tag  TEXT,
        title     TEXT,
        url       TEXT,
        duration  TEXT,
        played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_guild ON song_history (guild_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_user ON song_history (user_id)`);
    const insert = db.prepare(
        "INSERT INTO song_history (guild_id, user_id, user_tag, title, url, duration) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const dedup = db.prepare(
        "SELECT id FROM song_history WHERE guild_id = ? AND url = ? AND played_at > datetime('now', '-5 minutes') LIMIT 1",
    );
    const select = db.prepare(
        "SELECT title, url, user_tag, duration, played_at FROM song_history WHERE guild_id = ? ORDER BY played_at DESC LIMIT ?",
    );
    log.db(`SQLite ready — ${path}`);
    return {
        saveSong: ({ guildId, userId, userTag, title, url, duration }) => {
            try {
                // @db/sqlite rejects undefined binds — coerce to null.
                const n = (v) => v ?? null;
                if (!dedup.get(n(guildId), n(url))) {
                    insert.run(n(guildId), n(userId), n(userTag), n(title), n(url), duration == null ? null : String(duration));
                }
            } catch (err) { log.error(`saveSong: ${err.message}`); }
        },
        getHistory: (guildId, limit) => select.all(guildId, limit),
    };
}

export async function initDb() {
    const url = Deno.env.get("DB_URL") ?? "";
    const path = url.startsWith("sqlite:") ? url.slice(7) : "./bot.db";
    adapter = await initSqlite(path);
}

export async function saveSong(data) {
    await adapter?.saveSong(data);
}

export async function getHistory(guildId, limit = 10) {
    return (await adapter?.getHistory(guildId, limit)) ?? [];
}
