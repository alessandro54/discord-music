import { createServer } from "node:http";
import { log } from "./logger.js";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Music Bot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;max-width:720px;margin:0 auto}
h1{font-size:1.3rem;margin-bottom:24px;color:#58a6ff}
.empty{color:#8b949e;font-size:.9rem}
.guild{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:16px}
.guild-name{font-size:.75rem;color:#8b949e;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.now-playing{font-size:1rem;font-weight:600;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{font-size:.8rem;color:#8b949e;margin-bottom:12px}
.controls{display:flex;gap:8px;margin-bottom:12px}
button{background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:.82rem}
button:hover{background:#30363d}
.stop{border-color:#f8514988;color:#f85149}
.stop:hover{background:#f8514922}
.queue{font-size:.8rem;color:#8b949e}
.qi{padding:3px 0;border-bottom:1px solid #21262d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qi:last-child{border:none}
.more{margin-top:4px;font-style:italic}
</style>
</head>
<body>
<h1>🎵 Music Bot</h1>
<div id="app"><p class="empty">Connecting…</p></div>
<script>
const TOKEN = new URLSearchParams(location.search).get('token') || '';
const qs = TOKEN ? '?token=' + TOKEN : '';

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function post(path) {
  fetch(path + qs, { method: 'POST' });
}

function render(guilds) {
  const app = document.getElementById('app');
  const active = guilds.filter(g => g.current);
  if (!active.length) {
    app.innerHTML = '<p class="empty">Nothing playing.</p>';
    return;
  }
  app.innerHTML = active.map(g => \`
    <div class="guild">
      <div class="guild-name">\${esc(g.guildName)}</div>
      <div class="now-playing">\${esc(g.current.title)}</div>
      <div class="meta">\${esc(g.current.duration)} · \${esc(g.current.requestedBy)} · \${g.total} in queue</div>
      <div class="controls">
        <button onclick="post('/guilds/\${g.guildId}/skip')">⏭ Skip</button>
        <button onclick="post('/guilds/\${g.guildId}/pause')">\${g.paused ? '▶ Resume' : '⏸ Pause'}</button>
        <button class="stop" onclick="post('/guilds/\${g.guildId}/stop')">⏹ Stop</button>
      </div>
      \${g.upcoming.length ? \`<div class="queue">\${g.upcoming.map((s,i) =>
        \`<div class="qi">\${i+2}. \${esc(s.title)} · \${s.duration}</div>\`
      ).join('')}\${g.total > 6 ? \`<div class="more">+\${g.total - 6} more</div>\` : ''}</div>\` : ''}
    </div>
  \`).join('');
}

const es = new EventSource('/events' + qs);
es.onmessage = e => render(JSON.parse(e.data));
es.onerror = () => {
  document.getElementById('app').innerHTML = '<p class="empty">Disconnected — reload to reconnect.</p>';
};
</script>
</body>
</html>`;

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
            ? {
                  title: q.current.title,
                  duration: q.current.duration,
                  requestedBy: q.current.requestedBy,
              }
            : null,
        upcoming: q.songs
            .slice(1, 6)
            .map((s) => ({ title: s.title, duration: s.duration })),
        total: q.songs.length,
    }));
}

export function startServer(port, queues, client) {
    createServer((req, res) => {
        const url = new URL(req.url, "http://x");

        if (!checkAuth(req)) {
            res.writeHead(401);
            return res.end("Unauthorized");
        }

        if (req.method === "GET" && url.pathname === "/") {
            res.writeHead(200, { "Content-Type": "text/html" });
            return res.end(HTML);
        }

        if (req.method === "GET" && url.pathname === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            const send = () =>
                res.write(
                    `data: ${JSON.stringify(getState(queues, client))}\n\n`,
                );
            send();
            const interval = setInterval(send, 2000);
            req.on("close", () => clearInterval(interval));
            return;
        }

        const action = url.pathname.match(
            /^\/guilds\/(\d+)\/(skip|pause|stop)$/,
        );
        if (req.method === "POST" && action) {
            const [, guildId, cmd] = action;
            const q = queues.get(guildId);
            if (!q) {
                res.writeHead(404);
                return res.end("Not found");
            }
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
