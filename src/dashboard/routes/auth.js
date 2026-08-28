const express = require("express");
const { buildAuthUrl, exchangeCode, fetchDiscordUser, getAccessLevel } = require("../auth");
const db = require("../../shared/db");
const { getConfiguredGuildIds } = require("../../shared/guilds");

module.exports = function authRoutes(client) {
  const router = express.Router();

  router.get("/login", (req, res) => {
    res.redirect(buildAuthUrl("staff"));
  });

  router.get("/callback", async (req, res) => {
    const { code, error, state } = req.query;
    if (error) return res.status(400).send(`Discord returned an error: ${error}`);
    if (!code) return res.status(400).send("Missing code");

    try {
      const token = await exchangeCode(code);
      const discordUser = await fetchDiscordUser(token.access_token);
      const displayName = `${discordUser.username}${discordUser.discriminator && discordUser.discriminator !== "0" ? "#" + discordUser.discriminator : ""}`;
      const avatar = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null;

      // ---- Applicant verifying their identity for the web portal ----
      if (typeof state === "string" && state.startsWith("apply:")) {
        const applyToken = state.slice("apply:".length);
        const session = db.getApplicationSession(applyToken);
        if (!session) return res.status(404).send("This application link has expired or doesn't exist.");
        if (session.user_id !== discordUser.id) {
          return res
            .status(403)
            .send(
              `This application link is for a different Discord account. It was started by a different user than the one you just signed in with (${displayName}).`
            );
        }
        db.verifyApplicationSession(applyToken);
        return res.redirect(`/apply/${applyToken}`);
      }

      // ---- Staff dashboard login ----
      const accessByGuild = {};
      const guildNames = {};
      for (const guildId of getConfiguredGuildIds()) {
        const level = await getAccessLevel(client, guildId, discordUser.id);
        if (level) {
          accessByGuild[guildId] = level;
          guildNames[guildId] = client.guilds.cache.get(guildId)?.name || guildId;
        }
      }

      const accessibleGuildIds = Object.keys(accessByGuild);
      if (accessibleGuildIds.length === 0) {
        return res
          .status(403)
          .send(
            "You don't have permission to access this dashboard on any configured server (requires Manage Server, the configured staff role, or Bot Manager access)."
          );
      }

      req.session.user = { id: discordUser.id, username: displayName, avatar };
      req.session.accessByGuild = accessByGuild;
      req.session.guildNames = guildNames;
      req.session.currentGuildId = accessibleGuildIds[0];
      req.session.accessLevel = accessByGuild[accessibleGuildIds[0]];
      res.redirect("/");
    } catch (err) {
      console.error("OAuth callback error:", err);
      res.status(500).send("Login failed. Check server logs.");
    }
  });

  router.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/auth/login"));
  });

  return router;
};
