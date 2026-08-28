const db = require("../../shared/db");
const { closeTicketChannel } = require("../../shared/ticketActions");
const { getConfiguredGuildIds } = require("../../shared/guilds");

const SWEEP_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

async function sweepOnce(client) {
  for (const guildId of getConfiguredGuildIds()) {
    const cfg = db.getGuildConfig(guildId);
    const hours = cfg.auto_close_inactive_hours || 0;
    if (hours <= 0) continue;

    const stale = db.listStaleOpenTickets(guildId, hours);
    for (const ticket of stale) {
      try {
        await closeTicketChannel(client, ticket, "System (auto-close, inactivity)");
      } catch (err) {
        console.error(`Auto-close failed for ticket #${ticket.id}:`, err.message);
      }
    }
  }
}

function startAutoCloseSweeper(client) {
  setInterval(() => sweepOnce(client).catch((err) => console.error("Auto-close sweep error:", err)), SWEEP_INTERVAL_MS);
}

module.exports = { startAutoCloseSweeper };
