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

  return client;
}

module.exports = { createBotClient };
