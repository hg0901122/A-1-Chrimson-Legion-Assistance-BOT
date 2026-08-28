const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../../shared/db");
const { isBotManager, envBotManagerIds } = require("../../shared/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("botmanager")
    .setDescription("Manage global Bot Manager access (beyond owner, in every server)")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Grant a user Bot Manager access")
        .addUserOption((opt) => opt.setName("user").setDescription("User to grant access").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Revoke a user's Bot Manager access")
        .addUserOption((opt) => opt.setName("user").setDescription("User to revoke").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List all Bot Managers")),

  async execute(interaction) {
    if (!isBotManager(interaction.user.id)) {
      return interaction.reply({
        content: "Only an existing Bot Manager can manage this list.",
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const user = interaction.options.getUser("user", true);
      db.addBotManager(user.id, user.tag, interaction.user.tag);
      return interaction.reply({ content: `✅ ${user.tag} is now a Bot Manager.`, ephemeral: true });
    }

    if (sub === "remove") {
      const user = interaction.options.getUser("user", true);
      if (envBotManagerIds().includes(user.id)) {
        return interaction.reply({
          content: "That user is a root Bot Manager set in the server's .env file and can't be removed from here.",
          ephemeral: true,
        });
      }
      db.removeBotManager(user.id);
      return interaction.reply({ content: `✅ ${user.tag} is no longer a Bot Manager.`, ephemeral: true });
    }

    if (sub === "list") {
      const dbManagers = db.listBotManagers();
      const rootIds = envBotManagerIds();
      const lines = [
        ...rootIds.map((id) => `<@${id}> — root (.env)`),
        ...dbManagers.filter((m) => !rootIds.includes(m.user_id)).map((m) => `<@${m.user_id}> — added by ${m.added_by || "unknown"}`),
      ];
      const embed = new EmbedBuilder()
        .setTitle("Bot Managers")
        .setColor(0x7c9eff)
        .setDescription(lines.length ? lines.join("\n") : "No bot managers configured.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
