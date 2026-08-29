const { getAccessLevel } = require("../shared/permissions");

const DISCORD_API = "https://discord.com/api/v10";

/**
 * Builds the Discord OAuth2 authorize URL. `state` round-trips through Discord
 * unmodified — used to tell /auth/callback whether this is a staff dashboard
 * login or an applicant verifying their identity for the web portal.
 */
function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: "https://railway.app",
    response_type: "code",
    scope: "identify",
    prompt: "consent",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: "https://railway.app",
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch user: ${res.status}`);
  return res.json();
}

/** Dashboard access gate: any access level (staff or manager) can log in; routes below further restrict by level. */
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/auth/login");
}

/** Route-level gate for manager-only pages (settings, config, team, custom commands). */
function requireManager(req, res, next) {
  if (req.session.user && req.session.accessLevel === "manager") return next();
  res.status(403).send("This page requires Manager-level access.");
}

module.exports = {
  buildAuthUrl,
  exchangeCode,
  fetchDiscordUser,
  getAccessLevel,
  requireAuth,
  requireManager,
};
