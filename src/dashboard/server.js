const path = require("node:path");
const express = require("express");
const session = require("express-session");
const { requireAuth } = require("./auth");

function createDashboard(client) {
  const app = express();

  if ((process.env.TRUST_PROXY || "true") !== "false") {
    app.set("trust proxy", true); // so req.ip reflects X-Forwarded-For behind a reverse proxy
  }

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, "public")));

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "insecure-dev-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 days
    })
  );

  // Public routes (no login required) — must be mounted before requireAuth.
  app.use("/auth", require("./routes/auth")(client));
  app.use("/apply", require("./routes/apply")(client));

  app.use(requireAuth);

  // Guild-switcher middleware: resolves req.currentGuildId + res.locals for every staff page.
  app.use((req, res, next) => {
    const accessByGuild = req.session.accessByGuild || {};
    if (!req.session.currentGuildId || !accessByGuild[req.session.currentGuildId]) {
      req.session.currentGuildId = Object.keys(accessByGuild)[0];
    }
    req.currentGuildId = req.session.currentGuildId;
    req.accessLevel = accessByGuild[req.currentGuildId];

    res.locals.currentUser = req.session.user || null;
    res.locals.currentGuildId = req.currentGuildId;
    res.locals.accessLevel = req.accessLevel;
    res.locals.availableGuilds = Object.keys(accessByGuild).map((id) => ({
      id,
      name: (req.session.guildNames || {})[id] || id,
    }));
    next();
  });

  app.get("/switch-guild/:id", (req, res) => {
    const accessByGuild = req.session.accessByGuild || {};
    if (accessByGuild[req.params.id]) {
      req.session.currentGuildId = req.params.id;
      req.session.accessLevel = accessByGuild[req.params.id];
    }
    res.redirect(req.get("Referer") || "/");
  });

  app.use("/", require("./routes/overview")(client));
  app.use("/applications", require("./routes/applications")(client));
  app.use("/tickets", require("./routes/tickets")(client));
  app.use("/blacklist", require("./routes/blacklist")(client));
  app.use("/settings", require("./routes/settings")(client));
  app.use("/team", require("./routes/team")(client));
  app.use("/commands", require("./routes/commands")(client));

  app.use((req, res) => res.status(404).render("404", { active: "" }));

  return app;
}

module.exports = { createDashboard };
