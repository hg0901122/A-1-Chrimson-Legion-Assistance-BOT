const express = require("express");
const db = require("../../shared/db");
const { decideApplication } = require("../../shared/applicationActions");
const { requireManager } = require("../auth");

module.exports = function applicationRoutes(client) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const guildId = req.currentGuildId;
    const pending = db.listApplications(guildId, { status: "pending" });
    const types = db.listApplicationTypes(guildId);
    res.render("applications", {
      active: "applications",
      pending,
      types: Object.fromEntries(types.map((t) => [t.id, t])),
    });
  });

  router.get("/log", (req, res) => {
    const guildId = req.currentGuildId;
    const status = req.query.status || undefined;
    const applicationTypeId = req.query.type ? Number(req.query.type) : undefined;
    const apps = db.listApplications(guildId, { status, applicationTypeId, limit: 500 });
    const types = db.listApplicationTypes(guildId);
    res.render("application-log", {
      active: "applications",
      apps,
      types,
      filterStatus: status || "",
      filterType: applicationTypeId || "",
      typesById: Object.fromEntries(types.map((t) => [t.id, t])),
    });
  });

  router.post("/:id/accept", async (req, res) => {
    try {
      await decideApplication(client, Number(req.params.id), "accepted", `${req.session.user.username} (dashboard)`);
    } catch (err) {
      console.error(err);
    }
    res.redirect("/applications");
  });

  router.post("/:id/deny", async (req, res) => {
    try {
      await decideApplication(client, Number(req.params.id), "denied", `${req.session.user.username} (dashboard)`);
    } catch (err) {
      console.error(err);
    }
    res.redirect("/applications");
  });

  // ---- Application type configuration (manager only) ----
  router.get("/config", requireManager, (req, res) => {
    const types = db.listApplicationTypes(req.currentGuildId);
    res.render("application-config-list", { active: "config", types });
  });

  router.get("/config/new", requireManager, async (req, res) => {
    const { channels, roles } = await fetchGuildPickables(client, req.currentGuildId);
    res.render("application-config-edit", { active: "config", appType: null, channels, roles });
  });

  router.post("/config/new", requireManager, (req, res) => {
    const data = parseAppTypeForm(req.body);
    const created = db.createApplicationType(req.currentGuildId, data);
    res.redirect(`/applications/config/${created.id}/edit`);
  });

  router.get("/config/:id/edit", requireManager, async (req, res) => {
    const appType = db.getApplicationType(Number(req.params.id));
    if (!appType) return res.status(404).send("Not found");
    const { channels, roles } = await fetchGuildPickables(client, req.currentGuildId);
    res.render("application-config-edit", { active: "config", appType, channels, roles });
  });

  router.post("/config/:id/edit", requireManager, (req, res) => {
    const data = parseAppTypeForm(req.body);
    db.updateApplicationType(Number(req.params.id), data);
    res.redirect("/applications/config");
  });

  router.post("/config/:id/delete", requireManager, (req, res) => {
    db.deleteApplicationType(Number(req.params.id));
    res.redirect("/applications/config");
  });

  return router;
};

/** Fetches text channels + roles from the guild for the config form's dropdowns. */
async function fetchGuildPickables(client, guildId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    const roles = await guild.roles.fetch();
    return {
      channels: [...channels.values()]
        .filter((c) => c && c.isTextBased && c.isTextBased())
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      roles: [...roles.values()]
        .filter((r) => r.name !== "@everyone")
        .map((r) => ({ id: r.id, name: r.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (err) {
    console.error("Failed to fetch guild channels/roles:", err.message);
    return { channels: [], roles: [] };
  }
}

/** Parses the dynamic question-builder form fields into a questions[] array. */
function parseAppTypeForm(body) {
  const labels = [].concat(body.q_label || []);
  const styles = [].concat(body.q_style || []);
  const required = [].concat(body.q_required || []);
  const placeholders = [].concat(body.q_placeholder || []);

  const questions = labels
    .map((label, i) => ({
      label: (label || "").trim(),
      style: styles[i] === "paragraph" ? "paragraph" : "short",
      required: required[i] !== "false",
      placeholder: (placeholders[i] || "").trim(),
    }))
    .filter((q) => q.label.length > 0);

  return {
    name: (body.name || "Untitled Application").trim(),
    description: (body.description || "").trim(),
    questions,
    log_channel_id: body.log_channel_id || null,
    review_ping_role_id: body.review_ping_role_id || null,
    accepted_role_id: body.accepted_role_id || null,
    denied_role_id: body.denied_role_id || null,
    cooldown_hours: Number(body.cooldown_hours) || 0,
    enabled: body.enabled === "on",
    portal_mode: body.portal_mode === "on",
  };
}
