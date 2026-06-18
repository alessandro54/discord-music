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
                if (!dedup.get(guildId, url)) insert.run(guildId, userId, userTag, title, url, String(duration));
            } catch (err) { log.error(`saveSong: ${err.message}`); }
        },
        getHistory: (guildId, limit) => select.all(guildId, limit),
    };
}

async function initMysql(url) {
    const { default: mysql } = await import("mysql2/promise");
    const pool = mysql.createPool(url);
    await pool.query(`CREATE TABLE IF NOT EXISTS song_history (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        guild_id   VARCHAR(32)  NOT NULL,
        user_id    VARCHAR(32),
        user_tag   VARCHAR(64),
        title      VARCHAR(512),
        url        VARCHAR(512),
        duration   VARCHAR(32),
        played_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_guild (guild_id),
        INDEX idx_user  (user_id)
    )`);
    log.db("MySQL connected, tables ready");
    return {
        saveSong: async ({ guildId, userId, userTag, title, url, duration }) => {
            try {
                const [rows] = await pool.query(
                    "SELECT id FROM song_history WHERE guild_id = ? AND url = ? AND played_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE) LIMIT 1",
                    [guildId, url],
                );
                if (!rows.length) await pool.query(
                    "INSERT INTO song_history (guild_id, user_id, user_tag, title, url, duration) VALUES (?, ?, ?, ?, ?, ?)",
                    [guildId, userId, userTag, title, url, String(duration)],
                );
            } catch (err) { log.error(`saveSong: ${err.message}`); }
        },
        getHistory: async (guildId, limit) => {
            const [rows] = await pool.query(
                "SELECT title, url, user_tag, duration, played_at FROM song_history WHERE guild_id = ? ORDER BY played_at DESC LIMIT ?",
                [guildId, limit],
            );
            return rows;
        },
    };
}

export async function initDb() {
    const url = process.env.DB_URL ?? "";
    if (url.startsWith("mysql")) {
        adapter = await initMysql(url);
    } else {
        const path = url.startsWith("sqlite:") ? url.slice(7) : "./bot.db";
        adapter = await initSqlite(path);
    }
}

export async function saveSong(data) {
    await adapter?.saveSong(data);
}

export async function getHistory(guildId, limit = 10) {
    return (await adapter?.getHistory(guildId, limit)) ?? [];
}
