# Deployment — Dokku on a VPS

CI/CD for the Discord music bot. Every push to `main` builds a Docker image,
pushes it to GitHub Container Registry (GHCR), then SSHes into a Dokku host and
redeploys via `git:from-image`.

```
push main ──► GitHub Actions ──► build image ──► push GHCR ──► ssh ──► dokku git:from-image
```

- **Repo:** `alessandro54/discord-music`
- **Image:** `ghcr.io/alessandro54/discord-music`
- **Dokku app:** `music-bot`
- **Dashboard:** `https://music.chumpitaz.dev` (optional web UI on port 3000)

The bot is a Discord **gateway client** — it does not need inbound HTTP to run.
The `:3000` HTTP server is only the optional control dashboard.

---

## Files in this repo

| File | Role |
|---|---|
| `.github/workflows/deploy.yml` | Build → push GHCR → ssh deploy |
| `Dockerfile` | Deno + ffmpeg + yt-dlp image; `EXPOSE 3000` |

No build step — Deno runs `src/index.js` directly. Slash commands are **not**
auto-registered on deploy (run `deno task deploy` locally when they change).

---

## One-time setup

Run on the machine indicated: **[local]** your laptop, **[server]** the Dokku
host (`ssh ubuntu@<server-ip>`), **[github]** the repo web UI.

### 1. Provision the Dokku host (skip if Dokku already installed)

On a fresh VPS (Ubuntu):

```bash
wget -NP . https://dokku.com/install/v0.38.19/bootstrap.sh
sudo DOKKU_TAG=v0.38.19 bash bootstrap.sh
```

Add your personal SSH key to the `dokku` user so you can manage it:

```bash
cat ~/.ssh/id_ed25519.pub | ssh root@<server-ip> "dokku ssh-keys:add admin"
```

### 2. Create the app + global proxy [server]

```bash
sudo dokku apps:create music-bot
```

Dokku reuses one nginx for all apps and routes by hostname, so the bot's
dashboard coexists with any other app (e.g. n8n) on ports 80/443 — no conflict.

### 3. Deploy SSH key for GitHub Actions

GitHub Actions needs a key to SSH into the host as `ubuntu`. Generate a
**dedicated** key (no passphrase — CI can't type one).

**[local]**

```bash
ssh-keygen -t ed25519 -C "gha-deploy" -f gha_deploy -N ""

# install the PUBLIC key on the server (use an existing working key to log in)
cat gha_deploy.pub | ssh -i ~/.ssh/<existing-key> ubuntu@<server-ip> \
  "cat >> ~/.ssh/authorized_keys"

# verify the new key works
ssh -i gha_deploy ubuntu@<server-ip> "echo ok"   # expect: ok
```

Store the **private** key in GitHub **base64-encoded** (raw PEM paste often
corrupts newlines → `Load key: error in libcrypto` at deploy time):

```bash
base64 -i gha_deploy | pbcopy
```

**[github]** Repo → Settings → Secrets and variables → Actions → New secret:

| Secret | Value |
|---|---|
| `DOKKU_SSH_KEY` | base64 of the private key (from clipboard) |

GHCR push uses the auto-provided `GITHUB_TOKEN` — no other secret needed.

Clean up **[local]**: `rm gha_deploy gha_deploy.pub`

The workflow decodes it:
```yaml
echo "${{ secrets.DOKKU_SSH_KEY }}" | base64 -d > ~/.ssh/id_ed25519
```

### 4. Let `ubuntu` run dokku [server]

The workflow runs `sudo dokku ...`. Grant passwordless sudo for just that binary:

```bash
echo "ubuntu ALL=(ALL) NOPASSWD: $(which dokku)" | sudo tee /etc/sudoers.d/dokku-deploy
sudo chmod 440 /etc/sudoers.d/dokku-deploy
sudo dokku version   # must run without a password prompt
```

### 5. App config / secrets [server]

Stored on the host, injected at runtime — never baked into the image. Values
are write-only once set (you cannot read them back; keep them in a password
manager).

```bash
sudo dokku config:set music-bot \
  BOT_TOKEN=<discord bot token> \
  CLIENT_ID=1513765585794895872 \
  GUILD_ID=414892529427939338 \
  OWNER_ID=<discord user id> \
  TURSO_DATABASE_URL=libsql://<your-db>.turso.io \
  TURSO_AUTH_TOKEN=<full-access token> \
  SPOTIFY_CLIENT_ID=<value> \
  SPOTIFY_CLIENT_SECRET=<value> \
  DASHBOARD_TOKEN=$(openssl rand -hex 24) \
  NODE_ENV=production
```

Notes:
- **`BOT_TOKEN` is required** — `src/index.js` logs in with `BOT_TOKEN` only
  (not `DISCORD_TOKEN`). If migrating from a platform that named it
  `DISCORD_TOKEN`, rename it here.
- **DB = Turso** (remote). `TURSO_DATABASE_URL` being set selects the Turso
  adapter; no `/data` volume or `DB_URL` needed. (For local SQLite instead,
  drop the Turso vars and mount a volume — see "SQLite alternative" below.)
- **`DASHBOARD_TOKEN`** protects the dashboard's control endpoints
  (skip/pause/stop). Required before exposing the dashboard publicly. Access it
  at `https://music.chumpitaz.dev/?token=<value>`.
- Optional: `YOUTUBE_COOKIES` (Netscape cookies if 403s become frequent).

### 6. Disable the zero-downtime health check [server]

The bot has no fast HTTP readiness on boot (Discord login takes a moment), so
Dokku's default check would fail the first deploy:

```bash
sudo dokku checks:disable music-bot
```

### 7. First deploy + make image public

Push to `main` (or re-run the workflow). The **build-and-push** job succeeds and
creates the GHCR package; the **deploy** job fails the first time because the
package is still private and the host can't pull it.

**[github]** Profile → Packages → `discord-music` → Package settings →
Change visibility → **Public**. The host then pulls anonymously (no registry
login).

> Private alternative: keep the package private and run once on the host
> `dokku registry:login ghcr.io <user> <PAT-with-read:packages>`.

Then **[github]** Actions → the failed run → **Re-run failed jobs**. Deploy now
pulls the public image and runs `git:from-image`.

### 8. Domain + HTTPS [server]

After the app is running and DNS resolves:

**DNS** — add an `A` record: `music.chumpitaz.dev → <server-ip>`
(verify: `dig +short music.chumpitaz.dev`).

```bash
# letsencrypt plugin (once per host)
sudo dokku plugin:install https://github.com/dokku/dokku-letsencrypt.git

sudo dokku letsencrypt:set music-bot email you@chumpitaz.dev
sudo dokku domains:set music-bot music.chumpitaz.dev
sudo dokku letsencrypt:enable music-bot
sudo dokku letsencrypt:cron-job --add   # auto-renew
```

`EXPOSE 3000` in the Dockerfile tells Dokku to map proxy → container:3000 and
inject `PORT`. The bot reads `PORT` (falls back to 3000).

---

## Everyday flow

- **Code change** → `git push origin main` → auto build + deploy. Done.
- **Slash command change** → run `deno task deploy` locally (needs `.env`),
  then push the code.
- **Secret change** → `sudo dokku config:set music-bot KEY=value` (triggers a restart).

---

## Verify / operate [server]

```bash
sudo dokku ps:report music-bot          # running state
sudo dokku logs music-bot --tail 100    # logs (look for bot login + dashboard line)
sudo dokku config:show music-bot        # current env
sudo dokku ps:restart music-bot         # restart
```

Rollback to a previous image (tags are `:<git-sha>`):
```bash
sudo dokku git:from-image music-bot ghcr.io/alessandro54/discord-music:<old-sha>
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Load key: error in libcrypto` / `Permission denied (publickey)` in deploy | Private key in secret is mangled. Store it **base64-encoded** and decode in CI (step 3). |
| Deploy job: `denied` / cannot pull image | GHCR package still private → make it public (step 7) or `dokku registry:login`. |
| `sudo: a password is required` in deploy | sudoers rule missing/wrong path (step 4). Check `which dokku` matches. |
| Bot builds but never comes online | Wrong/missing `BOT_TOKEN` (must be `BOT_TOKEN`, not `DISCORD_TOKEN`). Check `dokku logs music-bot`. |
| First deploy fails on health check | `sudo dokku checks:disable music-bot` (step 6). |
| Dashboard reachable without auth | Set `DASHBOARD_TOKEN` and use `?token=...`. |
| OOM / bot dies mid-song | yt-dlp child not reaped — see memory notes in `CLAUDE.md`. Ensure VPS has enough RAM/swap. |

---

## SQLite alternative (instead of Turso)

If running SQLite locally on the host rather than Turso:

```bash
sudo dokku config:unset music-bot TURSO_DATABASE_URL TURSO_AUTH_TOKEN
sudo dokku config:set music-bot DB_URL=sqlite:/data/bot.db
sudo dokku storage:ensure-directory music-bot
sudo dokku storage:mount music-bot /var/lib/dokku/data/storage/music-bot:/data
sudo dokku ps:restart music-bot
```

The mount persists `/data/bot.db` across deploys.
