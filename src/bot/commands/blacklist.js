const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../../shared/db");
const { hasAtLeast } = require("../../shared/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Manage the ticket/application blacklist")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Blacklist a user from tickets and applications")
        .addUserOption((opt) => opt.setName("user").setDescription("User to blacklist").setRequired(true))
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a user from the blacklist")
        .addUserOption((opt) => opt.setName("user").setDescription("User to remove").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List blacklisted users")),
  // No setDefaultMemberPermissions here: access is checked manually below so that
  // Bot Managers can always use this even without Manage Server in a given guild.

  async execute(interaction) {
    const allowed = await hasAtLeast(interaction.client, interaction.guildId, interaction.user.id, "staff");
    if (!allowed) {
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "add") {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") || "No reason provided";
      db.addBlacklist(guildId, user.id, user.tag, reason, interaction.user.tag);
      return interaction.reply({
        content: `🚫 ${user.tag} has been blacklisted. Reason: ${reason}`,
        ephemeral: true,
      });
    }

    if (sub === "remove") {
      const user = interaction.options.getUser("user", true);
      db.removeBlacklist(guildId, user.id);
      return interaction.reply({ content: `✅ ${user.tag} has been removed from the blacklist.`, ephemeral: true });
    }

    if (sub === "list") {
      const entries = db.listBlacklist(guildId);
      if (entries.length === 0) {
        return interaction.reply({ content: "The blacklist is empty.", ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setTitle("Blacklisted Users")
        .setColor(0xed4245)
        .setDescription(
          entries
            .slice(0, 25)
            .map((e) => `<@${e.user_id}> (${e.username || e.user_id}) — ${e.reason || "No reason"}`)
            .join("\n")
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
