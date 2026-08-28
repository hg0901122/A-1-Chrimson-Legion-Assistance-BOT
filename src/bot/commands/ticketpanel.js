const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { hasAtLeast } = require("../../shared/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Post the ticket-creation panel in this channel")
    .addStringOption((opt) =>
      opt.setName("title").setDescription("Panel title").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("description").setDescription("Panel description").setRequired(false)
    ),
  // No setDefaultMemberPermissions here: access is checked manually below so that
  // Bot Managers can always use this even without Manage Server in a given guild.

  async execute(interaction) {
    const allowed = await hasAtLeast(interaction.client, interaction.guildId, interaction.user.id, "staff");
    if (!allowed) {
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
    }

    const title = interaction.options.getString("title") || "Need help?";
    const description =
      interaction.options.getString("description") ||
      "Click the button below to open a private ticket with our staff team.";

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(0x5865f2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_create")
        .setLabel("Open Ticket")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Primary)
    );

    // Reply first, then post the panel — posting is the slower of the two
    // operations, and doing it after the reply avoids the 3-second
    // interaction window expiring ("Unknown interaction", code 10062).
    await interaction.reply({ content: "Posting panel...", ephemeral: true });
    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: "Panel posted." });
  },
};
