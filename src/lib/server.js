import { createServer } from "node:http";
import { getConfig, setConfig } from "./config.js";
import { log } from "./logger.js";
import HTML from "./dashboard.html" with { type: "text" };
import CONFIG_HTML from "./config.html" with { type: "text" };

function checkAuth(req) {
    const token = process.env.DASHBOARD_TOKEN;
    if (!token) return true;
    const url = new URL(req.url, "http://x");
    return (
        url.searchParams.get("token") === token ||
        req.headers.authorization === `Bearer ${token}`
    );
}

function getState(queues, client) {
    return [...queues.entries()].map(([guildId, q]) => ({
        guildId,
        guildName: client.guilds.cache.get(guildId)?.name ?? guildId,
        playing: q.playing,
        paused: q.paused,
        current: q.current
            ? { title: q.current.title, duration: q.current.duration, requestedBy: q.current.requestedBy }
            : null,
        upcoming: q.songs.slice(1, 6).map((s) => ({ title: s.title, duration: s.duration })),
        total: q.songs.length,
    }));
}

function getGuilds(client) {
    return [...client.guilds.cache.values()].map((g) => ({
        id: g.id,
        name: g.name,
        channels: [...g.channels.cache.values()]
            .filter((c) => c.type === 0) // text channels only
            .sort((a, b) => a.position - b.position)
            .map((c) => ({ id: c.id, name: c.name })),
        config: getConfig(g.id),
    }));
}

function readBody(req) {
    return new Promise((resolve) => {
        let body = "";
        req.on("data", (d) => { body += d; });
        req.on("end", () => resolve(body));
    });
}

export function startServer(port, queues, client) {
    createServer(async (req, res) => {
        const url = new URL(req.url, "http://x");

        if (!checkAuth(req)) {
            res.writeHead(401);
            return res.end("Unauthorized");
        }

        if (req.method === "GET" && url.pathname === "/") {
            res.writeHead(200, { "Content-Type": "text/html" });
            return res.end(HTML);
        }

        if (req.method === "GET" && url.pathname === "/config") {
            res.writeHead(200, { "Content-Type": "text/html" });
            return res.end(CONFIG_HTML);
        }

        if (req.method === "GET" && url.pathname === "/api/guilds") {
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(getGuilds(client)));
        }

        if (req.method === "POST" && url.pathname.match(/^\/config\/\d+$/)) {
            const guildId = url.pathname.split("/")[2];
            const body = await readBody(req);
            const patch = Object.fromEntries(new URLSearchParams(body));
            setConfig(guildId, patch);
            res.writeHead(200);
            return res.end("OK");
        }

        if (req.method === "GET" && url.pathname === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            let last = "";
            const send = () => {
                const payload = JSON.stringify(getState(queues, client));
                if (payload === last) return;
                last = payload;
                res.write(`data: ${payload}\n\n`);
            };
            send();
            const interval = setInterval(send, 2000);
            req.on("close", () => clearInterval(interval));
            return;
        }

        const action = url.pathname.match(/^\/guilds\/(\d+)\/(skip|pause|stop)$/);
        if (req.method === "POST" && action) {
            const [, guildId, cmd] = action;
            const q = queues.get(guildId);
            if (!q) { res.writeHead(404); return res.end("Not found"); }
            if (cmd === "skip") q.skip();
            else if (cmd === "pause") q.paused ? q.resume() : q.pause();
            else if (cmd === "stop") q.stop();
            res.writeHead(200);
            return res.end("OK");
        }

        res.writeHead(404);
        res.end("Not found");
    }).listen(port, () => {
        const token = process.env.DASHBOARD_TOKEN;
        log.info(`dashboard on :${port}${token ? `?token=${token}` : ""}`);
    });
}
