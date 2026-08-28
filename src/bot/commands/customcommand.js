const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../../shared/db");
const { hasAtLeast } = require("../../shared/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("customcommand")
    .setDescription("Manage custom text commands")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add or update a custom command")
        .addStringOption((opt) => opt.setName("trigger").setDescription("Word after the prefix, e.g. rules").setRequired(true))
        .addStringOption((opt) => opt.setName("response").setDescription("What the bot replies with").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a custom command")
        .addStringOption((opt) => opt.setName("trigger").setDescription("Trigger to remove").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List all custom commands")),

  async execute(interaction) {
    const allowed = await hasAtLeast(interaction.client, interaction.guildId, interaction.user.id, "staff");
    if (!allowed) {
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const cfg = db.getGuildConfig(guildId);

    if (sub === "add") {
      const trigger = interaction.options.getString("trigger", true).toLowerCase().replace(/\s+/g, "");
      const response = interaction.options.getString("response", true);
      db.createCustomCommand(guildId, trigger, response, interaction.user.tag);
      return interaction.reply({
        content: `✅ \`${cfg.command_prefix}${trigger}\` will now reply with your text.`,
        ephemeral: true,
      });
    }

    if (sub === "remove") {
      const trigger = interaction.options.getString("trigger", true).toLowerCase();
      const existing = db.getCustomCommand(guildId, trigger);
      if (!existing) return interaction.reply({ content: "No command with that trigger exists.", ephemeral: true });
      db.deleteCustomCommand(existing.id);
      return interaction.reply({ content: `✅ Removed \`${cfg.command_prefix}${trigger}\`.`, ephemeral: true });
    }

    if (sub === "list") {
      const commands = db.listCustomCommands(guildId);
      const embed = new EmbedBuilder()
        .setTitle("Custom Commands")
        .setColor(0x7c9eff)
        .setDescription(
          commands.length
            ? commands.map((c) => `\`${cfg.command_prefix}${c.trigger}\``).join(", ")
            : "No custom commands yet."
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
