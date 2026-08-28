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

    const message = interaction.options.getString("message", true);
    const channel = interaction.options.getChannel("channel") || interaction.channel;

    await channel.send({ content: message });
    await interaction.reply({ content: `Sent to ${channel}.`, ephemeral: true });
  },
};
