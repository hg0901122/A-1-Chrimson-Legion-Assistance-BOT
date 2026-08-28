const express = require("express");
const db = require("../../shared/db");
const { requireManager } = require("../auth");
const { envBotManagerIds } = require("../../shared/permissions");

module.exports = function teamRoutes(client) {
  const router = express.Router();
  router.use(requireManager);

  router.get("/", (req, res) => {
    res.render("team", {
      active: "team",
      staff: db.listStaffMembers(req.currentGuildId),
      botManagers: db.listBotManagers(),
      rootManagerIds: envBotManagerIds(),
    });
  });

  router.post("/add", async (req, res) => {
    const userId = (req.body.user_id || "").trim();
    const role = req.body.role === "manager" ? "manager" : "staff";
    if (userId) {
      let username = userId;
      try {
        username = (await client.users.fetch(userId)).tag;
      } catch {
        // fall back to raw ID
      }
      db.addStaffMember(req.currentGuildId, userId, username, role, req.session.user.username);
    }
    res.redirect("/team");
  });

  router.post("/:userId/remove", (req, res) => {
    db.removeStaffMember(req.currentGuildId, req.params.userId);
    res.redirect("/team");
  });

  // ---- Global Bot Managers (cross-guild superusers) ----
  router.post("/bot-managers/add", async (req, res) => {
    const userId = (req.body.user_id || "").trim();
    if (userId) {
      let username = userId;
      try {
        username = (await client.users.fetch(userId)).tag;
      } catch {
        // fall back to raw ID
      }
      db.addBotManager(userId, username, req.session.user.username);
    }
    res.redirect("/team");
  });

  router.post("/bot-managers/:userId/remove", (req, res) => {
    if (envBotManagerIds().includes(req.params.userId)) {
      return res.status(400).send("This user is a root Bot Manager set in .env and can't be removed here.");
    }
    db.removeBotManager(req.params.userId);
    res.redirect("/team");
  });

  return router;
};
