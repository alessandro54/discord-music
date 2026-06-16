import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "./logger.js";

const CONFIG_PATH = join(process.cwd(), "config.json");

let _config = {};
try {
    _config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    log.info(`config loaded from ${CONFIG_PATH}`);
} catch {
    // no config file yet — starts empty, written on first /setup
}

export function getConfig(guildId) {
    return _config[guildId] ?? {};
}

export function setConfig(guildId, patch) {
    _config[guildId] = { ..._config[guildId], ...patch };
    writeFileSync(CONFIG_PATH, JSON.stringify(_config, null, 2));
}
