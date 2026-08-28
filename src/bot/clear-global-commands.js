require("dotenv").config();
const { REST, Routes } = require("discord.js");

const { DISCORD_TOKEN, CLIENT_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  console.log("Clearing all globally-registered commands...");
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
  console.log("Done. Run `npm run deploy` to re-register commands per guild.");
})();
