const express = require("express");
const { buildAuthUrl, exchangeCode, fetchDiscordUser, getAccessLevel } = require("../auth");
const { getConfiguredGuildIds } = require("../../shared/guilds");

module.exports = (client) => {
  const router = express.Router();

  router.get("/login", (req, res) => {
    if (req.session.user) return res.redirect("/");
    res.redirect(buildAuthUrl("staff"));
  });

  router.get("/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).send("Missing OAuth code.");

    try {
      const tokenData = await exchangeCode(code);
      const discordUser = await fetchDiscordUser(tokenData.access_token);

      const displayName = discordUser.global_name || discordUser.username;
      const avatar = discordUser.avatar
        ? `https://discordapp.com{discordUser.id}/${discordUser.avatar}.png`
        : null;

      if (typeof state === "string" && state.startsWith("apply:")) {
        const applyToken = state.slice("apply:".length);
        const session = global.db?.getApplicationSession ? global.db.getApplicationSession(applyToken) : null;
        if (!session) return res.status(404).send("This application link has expired.");
        if (session.user_id !== discordUser.id) {
          return res.status(403).send("This application link is for a different Discord account.");
        }
        if (global.db?.verifyApplicationSession) global.db.verifyApplicationSession(applyToken);
        return res.redirect(`/apply/${applyToken}`);
      }

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
        return res.status(403).send("You don't have permission to access this dashboard.");
      }

      req.session.user = { id: discordUser.id, username: displayName, avatar };
      req.session.accessByGuild = accessByGuild;
      req.session.guildNames = guildNames;
      req.session.currentGuildId = accessibleGuildIds[0];
      req.session.accessLevel = accessByGuild[accessibleGuildIds[0]];

      res.redirect("/");
    } catch (err) {
      console.error("OAuth callback error:", err);
      res.status(500).send("Authentication failed.");
    }
  });

  router.get("/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/auth/login");
    });
  });

  return router;
};
