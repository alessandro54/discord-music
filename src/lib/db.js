import mysql from "mysql2/promise";
import { log } from "./logger.js";

let pool;

export async function initDb() {
    if (!process.env.DB_URL) {
        log.info("DB_URL missing — song history disabled");
        return;
    }
    pool = mysql.createPool(process.env.DB_URL);
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
    log.db("Connected, tables ready");
}

export async function saveSong({ guildId, userId, userTag, title, url, duration }) {
    if (!pool) return;
    try {
        await pool.query(
            "INSERT INTO song_history (guild_id, user_id, user_tag, title, url, duration) VALUES (?, ?, ?, ?, ?, ?)",
            [guildId, userId, userTag, title, url, String(duration)],
        );
    } catch (err) {
        log.error(`saveSong: ${err.message}`);
    }
}

export async function getHistory(guildId, limit = 10) {
    if (!pool) return [];
    const [rows] = await pool.query(
        "SELECT title, url, user_tag, duration, played_at FROM song_history WHERE guild_id = ? ORDER BY played_at DESC LIMIT ?",
        [guildId, limit],
    );
    return rows;
}
