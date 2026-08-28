const express = require("express");
const db = require("../../shared/db");

module.exports = function overviewRoutes() {
  const router = express.Router();

  router.get("/", (req, res) => {
    const guildId = req.currentGuildId;
    if (!guildId) return res.render("no-guild", { active: "overview" });

    const pending = db.listApplications(guildId, { status: "pending" });
    const openTickets = db.listTickets(guildId, { status: "open" });
    const blacklisted = db.listBlacklist(guildId);
    const ipBlacklisted = db.listIpBlacklist(guildId);
    const types = db.listApplicationTypes(guildId);
    const allApps = db.listApplications(guildId, { limit: 1000 });

    res.render("overview", {
      active: "overview",
      stats: {
        pendingApplications: pending.length,
        openTickets: openTickets.length,
        blacklisted: blacklisted.length,
        ipBlacklisted: ipBlacklisted.length,
        applicationTypes: types.length,
        totalApplications: allApps.length,
        accepted: allApps.filter((a) => a.status === "accepted").length,
        denied: allApps.filter((a) => a.status === "denied").length,
      },
      recentApplications: allApps.slice(0, 8),
      recentTickets: db.listTickets(guildId, { limit: 8 }),
    });
  });

  return router;
};
