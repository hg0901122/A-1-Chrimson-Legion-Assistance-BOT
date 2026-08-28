require("dotenv").config();
const { createBotClient } = require("./src/bot/client");
const { createDashboard } = require("./src/dashboard/server");
const { getConfiguredGuildIds } = require("./src/shared/guilds");

const REQUIRED_ENV = ["DISCORD_TOKEN", "CLIENT_ID", "CLIENT_SECRET"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required .env values: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill it in first.");
  process.exit(1);
}

if (getConfiguredGuildIds().length === 0) {
  console.error("Missing GUILD_IDS (or legacy GUILD_ID) in .env — set at least one server ID.");
  process.exit(1);
}

if (!process.env.BOT_MANAGER_IDS) {
  console.warn(
    "Warning: BOT_MANAGER_IDS is empty in .env. Dashboard access falls back to Manage Server " +
      "permission / staff role only. Set BOT_MANAGER_IDS to your Discord user ID for guaranteed root access."
  );
}

async function main() {
  const client = createBotClient();
  await client.login(process.env.DISCORD_TOKEN);

  const app = createDashboard(client);
  const port = process.env.PORT || process.env.DASHBOARD_PORT || 3000;
  app.listen(port, () => {
    console.log(`Dashboard running at ${process.env.DASHBOARD_URL || `http://localhost:${port}`}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
