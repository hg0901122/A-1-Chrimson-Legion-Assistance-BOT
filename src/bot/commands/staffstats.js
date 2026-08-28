const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../../shared/db");
const { hasAtLeast } = require("../../shared/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staffstats")
    .setDescription("Show ticket and application activity for a staff member")
    .addUserOption((opt) => opt.setName("user").setDescription("Who to check (defaults to you)").setRequired(false)),

  async execute(interaction) {
    const allowed = await hasAtLeast(interaction.client, interaction.guildId, interaction.user.id, "staff");
    if (!allowed) {
      return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
    }

    const target = interaction.options.getUser("user") || interaction.user;
    const tickets = db.listTickets(interaction.guildId, { limit: 5000 });
    const apps = db.listApplications(interaction.guildId, { limit: 5000 });

    const claimed = tickets.filter((t) => t.claimed_by === target.id).length;
    const closed = tickets.filter((t) => t.closed_by === target.tag).length;
    const reviewed = apps.filter((a) => a.reviewed_by && a.reviewed_by.startsWith(target.tag)).length;

    const embed = new EmbedBuilder()
      .setTitle(`Staff Stats — ${target.tag}`)
      .setColor(0x7c9eff)
      .addFields(
        { name: "Tickets claimed", value: String(claimed), inline: true },
        { name: "Tickets closed", value: String(closed), inline: true },
        { name: "Applications reviewed", value: String(reviewed), inline: true }
      )
      .setThumbnail(target.displayAvatarURL());

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
