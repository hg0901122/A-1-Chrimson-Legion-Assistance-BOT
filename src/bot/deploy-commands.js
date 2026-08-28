require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const { getConfiguredGuildIds } = require("../shared/guilds");

const { DISCORD_TOKEN, CLIENT_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

const commandsDir = path.join(__dirname, "commands");
const commands = fs
  .readdirSync(commandsDir)
  .filter((f) => f.endsWith(".js"))
  .map((f) => require(path.join(commandsDir, f)).data.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  try {
    const guildIds = getConfiguredGuildIds();

    if (guildIds.length === 0) {
      console.log(`Deploying ${commands.length} slash command(s) globally...`);
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log("Deployed globally (may take up to 1 hour to appear).");
      console.log(
        "Tip: set GUILD_IDS in .env for instant per-server deploys instead of global."
      );
      return;
    }

    // Always clear global commands when deploying per-guild, so the same
    // command doesn't show up twice (once globally, once per guild).
    console.log("Clearing any global commands to avoid duplicates...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });

    for (const guildId of guildIds) {
      console.log(`Deploying ${commands.length} slash command(s) to guild ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
      console.log(`Deployed instantly to guild ${guildId}.`);
    }
  } catch (err) {
    console.error(err);
  }
})();
