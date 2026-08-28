const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { hasAtLeast } = require("../../shared/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Send a message as the bot (staff only)")
    .addStringOption((opt) => opt.setName("message").setDescription("What to send").setRequired(true))
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Where to send it (defaults to this channel)")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction) {
    const allowed = await hasAtLeast(interaction.client, interaction.guildId, interaction.user.id, "staff");
    if (!allowed) {
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
    }

    // Defer immediately — sending the message below can take longer than
    // Discord's 3-second interaction window, which would otherwise make the
    // final reply fail with "Unknown interaction" (code 10062).
    await interaction.deferReply({ ephemeral: true });

    const message = interaction.options.getString("message", true);
    const channel = interaction.options.getChannel("channel") || interaction.channel;

    try {
      await channel.send({ content: message });
      await interaction.editReply(`Sent to ${channel}.`);
    } catch (err) {
      await interaction.editReply(`Couldn't send that message: ${err.message}`);
    }
  },
};