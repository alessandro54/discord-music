const R = "\x1b[0m";
const ts = () => `\x1b[90m${new Date().toISOString().slice(11, 19)}\x1b[0m`;

export const log = {
    info: (msg) => console.log(`${ts()} \x1b[33m[info]\x1b[0m  ${msg}`),
    music: (msg) => console.log(`${ts()} \x1b[36m[music]\x1b[0m ${msg}`),
    cmd: (msg) => console.log(`${ts()} \x1b[32m[cmd]\x1b[0m   ${msg}`),
    db: (msg) => console.log(`${ts()} \x1b[35m[db]\x1b[0m    ${msg}`),
    warn: (msg) => console.warn(`${ts()} \x1b[33m[warn]\x1b[0m  ${msg}`),
    error: (msg) => console.error(`${ts()} \x1b[31m[error]\x1b[0m ${msg}`),
    bold: (str) => `\x1b[1m${str}${R}`,
    gray: (str) => `\x1b[90m${str}${R}`,
    cyan: (str) => `\x1b[36m${str}${R}`,
};
