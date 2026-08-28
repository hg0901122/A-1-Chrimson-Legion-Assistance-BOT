const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const db = require("../../shared/db");
const { startApplication } = require("../handlers/applications");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Apply to join with one of the server's applications"),

  async execute(interaction) {
    const guildId = interaction.guildId;

    if (db.isBlacklisted(guildId, interaction.user.id)) {
      return interaction.reply({
        content: "🚫 You are blacklisted and cannot submit applications.",
        ephemeral: true,
      });
    }

    const types = db.listApplicationTypes(guildId, { onlyEnabled: true });
    if (types.length === 0) {
      return interaction.reply({
        content: "There are no applications open right now. Check back later!",
        ephemeral: true,
      });
    }

    if (types.length === 1) {
      // Skip the picker and go straight to the modal.
      return startApplication(interaction, types[0]);
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("join_select_type")
      .setPlaceholder("Choose an application")
      .addOptions(
        types.slice(0, 25).map((t) => ({
          label: t.name.slice(0, 100),
          description: (t.description || "").slice(0, 100) || undefined,
          value: String(t.id),
        }))
      );

    await interaction.reply({
      content: "Which application would you like to start?",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true,
    });
  },
};
