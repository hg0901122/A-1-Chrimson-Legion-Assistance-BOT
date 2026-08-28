# Discord Ticket + Application Bot ("Warden")

A Discord bot with:

- 🎫 **Tickets** — ticket panel, claim/close, auto-close on inactivity, transcripts, account-age gating, per-user open-ticket limits.
- 📝 **Configurable applications** — `/join` with fully custom questions, attempt-number tracking, cooldowns, and a choice between Discord modals or a **full web application portal**.
- 🌐 **Web dashboard** — Discord-login-gated, multi-server aware, with pending review, full application log, ticket log + transcripts, blacklist (users **and** IPs), custom commands, team/manager management, and 20+ server settings.
- 🔑 **Bot Managers** — global, cross-server superusers who bypass all permission checks everywhere, set via `.env` or granted later from Discord/dashboard.
- 🚫 **Blacklist** — per-user (Discord-wide) and per-IP (web portal only — Discord never exposes IP data to bots).
- 🤖 **Custom commands** — dashboard- or Discord-managed text triggers, no code changes needed.
- 🧩 **9 slash commands**: `/join`, `/ticketpanel`, `/blacklist`, `/botmanager`, `/customcommand`, `/staffstats`, `/say`, `/purge`, `/whois`.

The bot and dashboard run in **one process** and share a local SQLite database, so dashboard actions (accept/deny an application, etc.) directly trigger the Discord side — role grants, DMs, message edits — no separate API needed.

---

## 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** tab → **Reset Token** → copy it. This is `DISCORD_TOKEN`.
3. Under **Privileged Gateway Intents**, enable **Server Members Intent** *and* **Message Content Intent** (Message Content is needed for custom commands to work).
4. **OAuth2** tab → copy **Client ID** (`CLIENT_ID`) and **Client Secret** (`CLIENT_SECRET`).
5. Still on **OAuth2 → Redirects** → add your dashboard's callback URL, e.g. `http://localhost:3000/auth/callback` for local use, or `https://your-app.onrender.com/auth/callback` once deployed. (Only one redirect is needed — the web application portal reuses this same callback.)
6. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; bot permissions: Manage Roles, Manage Channels, Manage Messages (for `/purge`), Send Messages, Embed Links, Read Message History, View Channels. Open the generated URL and invite the bot to each server you'll manage.
7. Copy each server's ID (right-click the server icon → Copy Server ID, with Developer Mode on).

## 2. Configure the project

```bash
npm install
cp .env.example .env
```

Fill in `.env` — see the comments in `.env.example` for details on each value. Key ones:

- `GUILD_IDS` — comma-separated server IDs (or use the older single `GUILD_ID` for one server).
- `BOT_MANAGER_IDS` — your own Discord user ID, so you always have root access to every server and the dashboard, no matter what.
- `SESSION_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `DASHBOARD_URL` — must exactly match what you registered as the OAuth2 redirect base.

## 3. Deploy slash commands

```bash
npm run deploy
```

This clears any stray global commands and (re)registers all 9 commands instantly to every server in `GUILD_IDS`. If you ever see **duplicate commands** in Discord's command picker, it means commands got registered both globally and per-guild at different times — run `npm run clear-global-commands` once, then `npm run deploy` again.

## 4. Run it

```bash
npm start
```

Logs the bot in and starts the dashboard at `DASHBOARD_URL`.

## 5. First-time setup

1. Run `/ticketpanel` in the channel you want the ticket button to live in.
2. Open the dashboard, log in with Discord.
3. Go to **Ticket Settings** and configure staff role, ticket category, log/transcript channels, and the other 20+ options.
4. Go to **Configure Applications** → **New Application** — add questions, pick roles/channels, and choose **Discord modal** or **web portal** mode.
5. Go to **Team & Managers** to add dashboard-only staff/managers or grant additional Bot Managers, if you want people to have access without a Discord role.
6. Members run `/join`.

---

## Permission model

Three levels, low to high:

| Level | Grants |
|---|---|
| **Staff** | Review/accept/deny applications, claim/close tickets, manage blacklist, use staff slash commands |
| **Manager** | Everything Staff can do, plus: Settings, application configuration, team management, custom commands |
| **Bot Manager** | Manager-level access in **every configured server**, always — set in `.env` (`BOT_MANAGER_IDS`, unlosable root list) or granted via `/botmanager` or the dashboard's Team page |

Staff/Manager access on a given server comes from any of: Manage Server / Administrator Discord permission, the server's configured staff role, being added directly via the dashboard's Team page, or being a Bot Manager.

## The web application portal

When an application type has **portal mode** enabled, `/join` replies with a link instead of opening a Discord modal. The flow:

1. Applicant clicks the link → lands on `/apply/:token`.
2. They **sign in with Discord** (reusing the same OAuth app) to prove they're the person who ran `/join` — prevents someone else from filling it out on their behalf.
3. They see the **full form on one page** — no 5-question modal limit like Discord has.
4. Optional lightweight verification challenge (enable "Show a verification challenge" in Settings) — a simple math check to stop trivial scripted spam. This is not a real CAPTCHA; if you need one, you'd wire a reCAPTCHA/hCaptcha site key into `apply-form.ejs` and verify it server-side in `routes/apply.js`.
5. On submit, it's logged exactly like a Discord submission — same attempt-number tracking, same review queue, same accept/deny flow.

The portal respects the same account-age and blacklist rules as Discord, **plus** IP blacklisting (Discord itself never exposes IP addresses to bots — that check only applies to this web flow).

## Notes & limitations

- Dashboard sessions use in-memory storage — fine for one process; swap in `connect-sqlite3` or Redis for a multi-instance deploy.
- Transcripts capture the last 100 messages in a ticket channel at close time (a Discord API practical limit for this approach).
- The verification challenge on the portal is a basic bot-check, not a production CAPTCHA — see above if you need the real thing.
- IP blacklisting only affects the web portal; Discord-side actions (tickets, modal applications) are blocked by user ID only, since that's all Discord ever exposes to a bot.
- This was built and syntax-checked in a sandboxed environment without network access, so dependencies could not be installed or the bot live-tested end-to-end — see the Render deployment guide below for getting it running for real.

---

## Deploying to Render

Render is a good fit here since the bot + dashboard run as one long-lived Node process (a **Web Service**, not a static site or serverless function).

This repo includes a `render.yaml` Blueprint — on Render, **New +** → **Blueprint** → connect your repo, and Render will pre-fill most of the setup below (build/start commands, the persistent disk, a generated session secret) and just prompt you for the secret values (token, client ID/secret, guild IDs, etc.). Otherwise, set it up manually:

### One-time setup

1. Push this project to a GitHub repo (see the GitHub guide below if you haven't already).
2. On [render.com](https://render.com) → **New +** → **Web Service** → connect your GitHub repo.
3. Configure:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free tier works for testing; note free instances spin down after inactivity, which will disconnect your bot until the next request wakes it — use a paid instance for a bot that needs to stay online 24/7.
4. Under **Environment Variables**, add every value from your `.env` file — Render doesn't read `.env` files from your repo, you set them in its dashboard instead. One Render-specific note: set `DASHBOARD_URL` to the `https://your-app-name.onrender.com` URL Render assigns you (visible at the top of your service's Render dashboard page). You don't need to set `DASHBOARD_PORT` on Render — the app automatically uses Render's own `PORT` variable when present, and only falls back to `DASHBOARD_PORT`/3000 for local runs.
5. Update your Discord application's **OAuth2 → Redirects** to add `https://your-app-name.onrender.com/auth/callback` (keep the localhost one too if you still test locally).
6. Deploy. Watch the Render logs for `Logged in as YourBot#1234` and `Dashboard running at ...` to confirm both halves started.
7. **Data persistence**: this project stores its SQLite database at `data/bot.sqlite`. Render's filesystem is **ephemeral on the free tier** — it resets on every deploy/restart, which would wipe your database. If you deployed via the included `render.yaml` Blueprint, a persistent disk is already mounted at `/opt/render/project/src/data` for you. If you set the service up manually instead, add a [Render Disk](https://render.com/docs/disks) at that same path yourself, or your data won't survive a redeploy.

### Redeploying after changes

Render redeploys automatically on every push to your connected branch (unless you've turned that off in settings). No extra steps needed beyond pushing to GitHub.

---

## Updating this project on GitHub

If this is already a GitHub repo you've pushed before:

```bash
git add .
git commit -m "Add multi-guild support, bot managers, web portal, and more settings"
git push
```

If you haven't pushed this version yet, or you're starting a new repo:

```bash
cd discord-ticket-bot
git init                                   # skip if already a git repo
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

A few things worth checking before you push:

- **Never commit `.env`** — it holds your bot token and client secret. It's already listed in `.gitignore`, but double-check with `git status` before committing that it doesn't show up as a tracked file.
- The `data/` folder is git-ignored except for a `.gitkeep` placeholder — your real `bot.sqlite` (with live tickets/applications) never gets pushed, which is correct; it should only exist on your running server (or Render Disk).
- If you rotate your bot token or client secret for any reason (e.g. one was accidentally exposed), update it in **both** your local `.env` and Render's environment variables — they're independent copies.

Once pushed, connect the repo to Render as described above — Render will pick up every future `git push` automatically.

## Project structure

```
index.js                     entry point — starts bot + dashboard together
src/
  shared/
    db.js                    SQLite schema + all data access
    permissions.js           bot manager + staff/manager access-level logic
    guilds.js                multi-guild ID resolution
    discordUtils.js          account-age calculation
    applicationActions.js    accept/deny + submission logic shared by bot & dashboard
    ticketActions.js         ticket close + transcript logic shared by bot & dashboard
  bot/
    client.js                Discord client bootstrap, command/event loading
    deploy-commands.js       registers slash commands per guild, clears global duplicates
    clear-global-commands.js standalone duplicate-command fix
    commands/                /join, /ticketpanel, /blacklist, /botmanager, /customcommand,
                              /staffstats, /say, /purge, /whois
    handlers/                interaction router, ticket/application flows, custom commands,
                              auto-close sweeper
    events/                  ready event
  dashboard/
    server.js                Express app, guild-switcher middleware
    auth.js                  Discord OAuth2 helpers + access-level checks
    routes/                  overview, applications, tickets, blacklist, settings, team,
                              commands, apply (public portal)
    views/                   EJS templates, incl. the public portal pages
    public/css/style.css     dashboard + portal styling
```
