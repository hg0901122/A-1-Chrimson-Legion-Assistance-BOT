const express = require("express");
const db = require("../../shared/db");
const { requireManager } = require("../auth");

module.exports = function commandsRoutes() {
  const router = express.Router();
  router.use(requireManager);

  router.get("/", (req, res) => {
    const cfg = db.getGuildConfig(req.currentGuildId);
    res.render("commands", {
      active: "commands",
      commands: db.listCustomCommands(req.currentGuildId),
      prefix: cfg.command_prefix || "!",
    });
  });

  router.post("/add", (req, res) => {
    const trigger = (req.body.trigger || "").trim().toLowerCase().replace(/\s+/g, "");
    const response = (req.body.response || "").trim();
    if (trigger && response) {
      db.createCustomCommand(req.currentGuildId, trigger, response, req.session.user.username);
    }
    res.redirect("/commands");
  });

  router.post("/:id/delete", (req, res) => {
    db.deleteCustomCommand(Number(req.params.id));
    res.redirect("/commands");
  });

  return router;
};
