const { SlashCommandBuilder } = require("discord.js");
const { hasAtLeast } = require("../../shared/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk-delete recent messages in this channel (staff only)")
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("How many messages (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)
    ),

  async execute(interaction) {
    const allowed = await hasAtLeast(interaction.client, interaction.guildId, interaction.user.id, "staff");
    if (!allowed) {
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
    }

    const count = interaction.options.getInteger("count", true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const deleted = await interaction.channel.bulkDelete(count, true);
      await interaction.editReply(`🧹 Deleted ${deleted.size} message(s). Note: Discord won't bulk-delete messages older than 14 days.`);
    } catch (err) {
      await interaction.editReply(`Couldn't delete messages: ${err.message}`);
    }
  },
};
