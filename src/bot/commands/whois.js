const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const db = require("../../shared/db");
const { accountAgeDays } = require("../../shared/discordUtils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whois")
    .setDescription("Look up ticket/application/blacklist history for a user")
    .addUserOption((opt) => opt.setName("user").setDescription("Who to look up").setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const guildId = interaction.guildId;

    const tickets = db.listTickets(guildId, { limit: 5000 }).filter((t) => t.user_id === user.id);
    const apps = db.listApplications(guildId, { limit: 5000 }).filter((a) => a.user_id === user.id);
    const blacklisted = db.isBlacklisted(guildId, user.id);

    const embed = new EmbedBuilder()
      .setTitle(`Whois — ${user.tag}`)
      .setColor(blacklisted ? 0xed4245 : 0x5865f2)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "Account age", value: `${Math.floor(accountAgeDays(user.id))} day(s)`, inline: true },
        { name: "Tickets opened", value: String(tickets.length), inline: true },
        { name: "Applications submitted", value: String(apps.length), inline: true },
        { name: "Blacklisted", value: blacklisted ? "🚫 Yes" : "✅ No", inline: true }
      );

    if (apps.length > 0) {
      const latest = apps[0];
      embed.addFields({
        name: "Latest application",
        value: `#${latest.id} — attempt #${latest.attempt_number} — ${latest.status}`,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
