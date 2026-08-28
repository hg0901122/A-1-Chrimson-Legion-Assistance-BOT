const express = require("express");
const db = require("../../shared/db");

module.exports = function ticketRoutes() {
  const router = express.Router();

  router.get("/", (req, res) => {
    const status = req.query.status || undefined;
    const tickets = db.listTickets(req.currentGuildId, { status, limit: 500 });
    res.render("tickets", { active: "tickets", tickets, filterStatus: status || "" });
  });

  router.get("/:id/transcript", (req, res) => {
    const ticket = db.getTicket(Number(req.params.id));
    if (!ticket || ticket.guild_id !== req.currentGuildId) return res.status(404).send("Not found");
    const transcript = db.getTranscriptForTicket(ticket.id);
    res.render("transcript", { active: "tickets", ticket, transcript });
  });

  return router;
};
