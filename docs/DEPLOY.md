# Hosting (popisle.oddbout.com)

The hosted game runs one Node server (`server/main.mjs`) behind nginx on the Oracle VM. The server serves `isles.html` and its modules and gives the page what claude.ai's artifact runtime gave it before, through `src/site/runtime.js`:

| Part | How |
| --- | --- |
| Players | Anonymous at first: the first visit makes an account with a generated name (for example "느긋한 수달") and an HttpOnly cookie. Linking a Google account comes later. |
| Storage | SQLite in `DATA_DIR` (`isles.db`): one row per doc, every change numbered. Pages get changes by long poll (`/api/col/<col>?after=n&wait=1`, up to 25 s). |
| Rules | `server/rules.mjs` checks every write. A player writes only their own island. Moving in needs the board's owner, an invite token for that board, or an open board. The first board (`main`) is a read-only showcase. Removal marks (`_mod`) belong to the board's owner. |
| Limits | nginx: 30 API requests a second per address (burst 60) and 30 open connections per address; `worker_connections 2048` on the VM. Server: a doc is at most 128 KB after an update is merged in, islands carry only their known fields, boards are checked field by field (the world map reads them), five boards a player. |
| Invites | `POST /api/invite` gives a member a token: 14 days, 9 friends. The link is `?board=<id>&from=<island>&k=<token>`. |
| Claude | `server/claude.mjs`, the Anthropic API with `claude-haiku-5-5` (or, until the API key arrives, the `claude` CLI with a subscription token: `SAMPLE=cli`, at most 2 at once). Each player has 5 builds or extensions a day; the one fix right after a build is free. Accounts are free, so one address also has at most 60 a day (`CLAUDE_PER_IP`). The whole server allows 300 calls a day; raise it to about 3000 (`CLAUDE_PER_DAY`) when the API key replaces the CLI. A call that fails before its first words is not counted and answers 503. |
| Link previews | `isles.html` gets `og:` tags: "<board> · 빈 섬 N개" and the archipelago's picture, which a member's page uploads when they share the link. Without a board, the title is the game's name and the picture is `src/brand/og.png`. |
| Name and brand | `src/brand.js` owns the game's name (팝업섬 / POPISLE), tagline, icon, logo and default preview picture. `isles.html` takes them as `%brand.<key>%` tokens, filled by `server/main.mjs` and `scripts/dev.mjs`. |

## Run it locally

```bash
cd server && npm ci && cd ..
SAMPLE=cli node server/main.mjs          # Claude from the local `claude` CLI; SAMPLE=api needs ANTHROPIC_API_KEY
# open http://127.0.0.1:5310/
```

Checks:

- `node scripts/check-site.mjs`: the server's rules, without a browser (its own server, faked Claude).
- `node scripts/check-site-play.mjs [base url] [shots dir]`: two people in a browser, from the showcase to a friend next door. Without a base URL it starts its own server with the local CLI (`SAMPLE=echo` fakes Claude).

The dev server (`scripts/dev.mjs`, `?me=` picks the player) stays for working on the game. Its own checks are listed in [ARCHITECTURE.md](ARCHITECTURE.md).

## First deploy

Do this only when the owner asks for it.

1. **DNS.** Point `popisle.oddbout.com` at the VM.
2. **Files.** On the VM:
   1. Put a clean checkout at `/opt/we-oddbout/releases/<sha>`.
   2. Run `npm ci` in `server/`. The VM has no system node or npm: build the release here (`git archive` + `npm ci --omit=dev` in `server/`), copy the tarball, and put a Node 22.13+ binary at `/opt/we-oddbout/bin/node` (the unit runs that one).
   3. Link `/opt/we-oddbout/current` to that release.
3. **Secrets.** Create `/opt/we-oddbout/env` with `ANTHROPIC_API_KEY=...` and `chmod 600`. `SESSION_SECRET` is optional: the server makes one in `DATA_DIR` the first time.
4. **Service.** Copy `deploy/we-oddbout.service` to `/etc/systemd/system/`, then run `systemctl enable --now we-oddbout`.
5. **nginx.** The VM's certbot has no nginx plugin, so issue the certificate by webroot first: serve only the port-80 block with the `acme-challenge` location, run `certbot certonly --webroot -w /var/www/letsencrypt -d popisle.oddbout.com`, then copy the full `deploy/popisle.oddbout.com.nginx` to `/etc/nginx/sites-available/`, link it, and run `nginx -t && nginx -s reload`.
6. **Check.** Run `node scripts/check-site-play.mjs https://popisle.oddbout.com`. It uses real Claude calls: two players, one build.

An update is a new release folder, a new `current` link and `systemctl restart we-oddbout`. `DATA_DIR` stays where it is. `scripts/release.sh` does all of it for the committed HEAD and prints the way back.

## Renaming stored board names

Board names are data, so a code change does not rename boards already made. `scripts/rename-boards.mjs` changes "군도" to "팝업섬" in them. Without `--apply` it only lists the changes. With `--apply` it refuses while the server runs, writes a checked copy of the store to `BACKUP_DIR`, and renames through the store so each change gets a new number. A name that would pass 24 characters is skipped and listed. The steps and the way back are at the top of the script.

## Backups

- **On the VM.** `deploy/we-oddbout-backup.timer` runs `server/backup.mjs` daily at 04:30 KST. It writes `/opt/we-oddbout/backups/isles-<day>.db.gz` (checked with `PRAGMA integrity_check`), the session `secret` and the `og/` pictures, and keeps 14 days. Install: copy the `.service` and `.timer` to `/etc/systemd/system/`, then `systemctl daemon-reload && systemctl enable --now we-oddbout-backup.timer`.
- **Off the VM.** `scripts/pull-backup.sh` copies them to `~/backups/we-oddbout/` on the machine that runs it and keeps 60 days. This machine's crontab runs it daily at 05:00 KST.
- **Restore.** Stop the service, `gunzip -c isles-<day>.db.gz > /opt/we-oddbout/data/isles.db`, delete `isles.db-wal` and `isles.db-shm` there, put `secret` back in `/opt/we-oddbout/data/` (without it every player loses their island), then start the service.

## Speed

- **Compression.** nginx gzips JS, CSS and JSON for this site (`deploy/popisle.oddbout.com.nginx`).
- **Revisits.** The server sends an ETag with every file, so a returning browser gets 304s instead of the files again.
- **The world map.** The coastlines (`src/v2/world-data.js`, about 1 MB) load the first time the world opens, not with the game.
- **Bundle (optional).** When `dist/main.js` exists, the page loads it instead of the separate modules. `scripts/release.sh` ships `dist/` when it is there. There is no build script yet: making one needs esbuild, which this machine's permissions have not allowed.

## Not done yet

- Linking a Google account, to keep an island on another device.
- Renaming a player. The server has `POST /api/name`; the game has no button for it yet.
