const db = require("../../shared/db");
const { touchTicketOnMessage } = require("./tickets");

/** Handles plain messages: bumps ticket activity, then matches custom commands (prefix + trigger). */
module.exports = async function messageCreate(message) {
  if (message.author.bot || !message.guildId) return;

  await touchTicketOnMessage(message);

  const cfg = db.getGuildConfig(message.guildId);
  const prefix = cfg.command_prefix || "!";
  if (!message.content.startsWith(prefix)) return;

  const trigger = message.content.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
  if (!trigger) return;

  const command = db.getCustomCommand(message.guildId, trigger);
  if (!command) return;

  await message.reply({ content: command.response, allowedMentions: { repliedUser: false } }).catch(() => {});
};
