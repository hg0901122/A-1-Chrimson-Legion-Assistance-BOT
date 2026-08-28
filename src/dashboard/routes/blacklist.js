const express = require("express");
const db = require("../../shared/db");

module.exports = function blacklistRoutes(client) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.render("blacklist", {
      active: "blacklist",
      entries: db.listBlacklist(req.currentGuildId),
      ipEntries: db.listIpBlacklist(req.currentGuildId),
    });
  });

  router.post("/add", async (req, res) => {
    const userId = (req.body.user_id || "").trim();
    const reason = (req.body.reason || "").trim();
    if (userId) {
      let username = userId;
      try {
        const user = await client.users.fetch(userId);
        username = user.tag;
      } catch {
        // fall back to raw ID if we can't resolve the user
      }
      db.addBlacklist(req.currentGuildId, userId, username, reason, req.session.user.username);
    }
    res.redirect("/blacklist");
  });

  router.post("/:userId/remove", (req, res) => {
    db.removeBlacklist(req.currentGuildId, req.params.userId);
    res.redirect("/blacklist");
  });

  // ---- IP blacklist (applies to the web application portal) ----
  router.post("/ip/add", (req, res) => {
    const ip = (req.body.ip || "").trim();
    const reason = (req.body.reason || "").trim();
    if (ip) db.addIpBlacklist(req.currentGuildId, ip, reason, req.session.user.username);
    res.redirect("/blacklist");
  });

  router.post("/ip/:ip/remove", (req, res) => {
    db.removeIpBlacklist(req.currentGuildId, req.params.ip);
    res.redirect("/blacklist");
  });

  return router;
};
