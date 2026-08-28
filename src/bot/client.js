const fs = require("node:fs");
const path = require("node:path");
const { Client, GatewayIntentBits, Collection, Partials } = require("discord.js");
const interactionCreate = require("./handlers/interactionCreate");
const messageCreate = require("./handlers/messageCreate");
const readyHandler = require("./events/ready");
const { startAutoCloseSweeper } = require("./handlers/autoClose");

function createBotClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.commands = new Collection();
  const commandsDir = path.join(__dirname, "commands");
  for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
    const command = require(path.join(commandsDir, file));
    client.commands.set(command.data.name, command);
  }

  client.once("ready", () => {
    readyHandler(client);
    startAutoCloseSweeper(client);
  });
  client.on("interactionCreate", interactionCreate);
  client.on("messageCreate", messageCreate);

  // Safety net: a failed REST call or stray promise rejection anywhere in the
  // bot should never take down the whole process (which also runs the
  // dashboard). Log it and keep going instead.
  client.on("error", (err) => console.error("Discord client error:", err));
  client.on("shardError", (err) => console.error("Discord shard error:", err));
  process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

  return client;
}

module.exports = { createBotClient };