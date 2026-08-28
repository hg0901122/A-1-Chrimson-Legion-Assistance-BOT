const express = require("express");
const db = require("../../shared/db");
const { requireManager } = require("../auth");

module.exports = function settingsRoutes(client) {
  const router = express.Router();
  router.use(requireManager);

  router.get("/", async (req, res) => {
    const guildId = req.currentGuildId;
    const cfg = db.getGuildConfig(guildId);
    let channels = [];
    let categories = [];
    let roles = [];
    try {
      const guild = await client.guilds.fetch(guildId);
      const allChannels = [...(await guild.channels.fetch()).values()];
      channels = allChannels
        .filter((c) => c && c.isTextBased && c.isTextBased())
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      categories = allChannels
        .filter((c) => c && c.type === 4) // GuildCategory
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      roles = [...(await guild.roles.fetch()).values()]
        .filter((r) => r.name !== "@everyone")
        .map((r) => ({ id: r.id, name: r.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.error("Failed to fetch guild data for settings:", err.message);
    }
    res.render("settings", { active: "settings", cfg, channels, categories, roles });
  });

  router.post("/", (req, res) => {
    const b = req.body;
    db.updateGuildConfig(req.currentGuildId, {
      staff_role_id: b.staff_role_id || null,
      ticket_category_id: b.ticket_category_id || null,
      ticket_log_channel_id: b.ticket_log_channel_id || null,
      transcript_channel_id: b.transcript_channel_id || null,
      embed_color: (b.embed_color || "5865F2").replace("#", "").toUpperCase(),
      footer_text: (b.footer_text || "").slice(0, 200),
      welcome_message: (b.welcome_message || "").slice(0, 500) || "Welcome {user}! Staff will be with you shortly.",
      ticket_name_format: (b.ticket_name_format || "ticket-{username}").slice(0, 80),
      max_open_tickets_per_user: Math.max(1, Number(b.max_open_tickets_per_user) || 1),
      auto_close_inactive_hours: Math.max(0, Number(b.auto_close_inactive_hours) || 0),
      require_reason_on_ticket: b.require_reason_on_ticket === "on" ? 1 : 0,
      transcript_enabled: b.transcript_enabled === "on" ? 1 : 0,
      dm_on_ticket_open: b.dm_on_ticket_open === "on" ? 1 : 0,
      dm_on_ticket_close: b.dm_on_ticket_close === "on" ? 1 : 0,
      dm_on_application_submit: b.dm_on_application_submit === "on" ? 1 : 0,
      min_account_age_days_ticket: Math.max(0, Number(b.min_account_age_days_ticket) || 0),
      min_account_age_days_application: Math.max(0, Number(b.min_account_age_days_application) || 0),
      captcha_enabled: b.captcha_enabled === "on" ? 1 : 0,
      portal_default_enabled: b.portal_default_enabled === "on" ? 1 : 0,
      command_prefix: (b.command_prefix || "!").trim().slice(0, 5) || "!",
    });
    res.redirect("/settings");
  });

  return router;
};
