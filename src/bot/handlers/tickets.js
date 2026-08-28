const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const db = require("../../shared/db");
const { closeTicketChannel } = require("../../shared/ticketActions");

function ticketControlsRow(claimed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel(claimed ? "Claimed" : "Claim")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(claimed),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Close").setStyle(ButtonStyle.Danger)
  );
}

function accountAgeDays(userId) {
  // Discord snowflake -> creation timestamp
  const DISCORD_EPOCH = 1420070400000n;
  const timestamp = Number((BigInt(userId) >> 22n) + DISCORD_EPOCH);
  return (Date.now() - timestamp) / 86_400_000;
}

async function preflightChecks(interaction, cfg) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (db.isBlacklisted(guildId, userId)) {
    return "🚫 You are blacklisted and cannot open tickets.";
  }
  if (db.countOpenTicketsForUser(guildId, userId) >= (cfg.max_open_tickets_per_user || 1)) {
    return `You already have the maximum number of open tickets (${cfg.max_open_tickets_per_user || 1}).`;
  }
  if (cfg.min_account_age_days_ticket > 0 && accountAgeDays(userId) < cfg.min_account_age_days_ticket) {
    return `Your account must be at least ${cfg.min_account_age_days_ticket} day(s) old to open a ticket.`;
  }
  return null;
}

async function handleCreateButton(interaction) {
  const cfg = db.getGuildConfig(interaction.guildId);
  const blocked = await preflightChecks(interaction, cfg);
  if (blocked) return interaction.reply({ content: blocked, ephemeral: true });

  if (cfg.require_reason_on_ticket) {
    const modal = new ModalBuilder()
      .setCustomId("ticket_reason_modal")
      .setTitle("Open a Ticket")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("What do you need help with?")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
        )
      );
    return interaction.showModal(modal);
  }

  return createTicketChannel(interaction, "");
}

async function handleReasonModalSubmit(interaction) {
  const cfg = db.getGuildConfig(interaction.guildId);
  const blocked = await preflightChecks(interaction, cfg);
  if (blocked) return interaction.reply({ content: blocked, ephemeral: true });
  const reason = interaction.fields.getTextInputValue("reason");
  return createTicketChannel(interaction, reason);
}

async function createTicketChannel(interaction, reason) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const cfg = db.getGuildConfig(guildId);

  await interaction.deferReply({ ephemeral: true });

  const overwrites = [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: interaction.client.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
    },
  ];
  if (cfg.staff_role_id) {
    overwrites.push({
      id: cfg.staff_role_id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const channelName = (cfg.ticket_name_format || "ticket-{username}")
    .replace("{username}", interaction.user.username)
    .slice(0, 90);

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: cfg.ticket_category_id || undefined,
    permissionOverwrites: overwrites,
    topic: `Ticket opened by ${interaction.user.tag} (${userId})${reason ? ` — ${reason}` : ""}`,
  });

  const ticket = db.createTicket({
    guild_id: guildId,
    channel_id: channel.id,
    user_id: userId,
    username: interaction.user.tag,
    reason,
  });

  const color = parseInt(cfg.embed_color || "5865F2", 16) || 0x5865f2;
  const welcomeText = (cfg.welcome_message || "Welcome {user}! Staff will be with you shortly.").replace(
    "{user}",
    `<@${userId}>`
  );

  const embed = new EmbedBuilder()
    .setTitle(`Ticket #${ticket.id}`)
    .setDescription(reason ? `${welcomeText}\n\n**Reason:** ${reason}` : welcomeText)
    .setColor(color);
  if (cfg.footer_text) embed.setFooter({ text: cfg.footer_text });
  embed.setTimestamp();

  await channel.send({
    content: cfg.staff_role_id ? `<@&${cfg.staff_role_id}>` : undefined,
    embeds: [embed],
    components: [ticketControlsRow()],
  });

  if (cfg.dm_on_ticket_open) {
    interaction.user
      .send(`Your ticket has been created: ${channel} in **${interaction.guild.name}**.`)
      .catch(() => {});
  }

  await interaction.editReply({ content: `Ticket created: <#${channel.id}>` });
}

async function handleClaimButton(interaction) {
  const ticket = db.getTicketByChannel(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "This isn't a ticket channel.", ephemeral: true });
  db.claimTicket(ticket.id, interaction.user.id);
  db.touchTicketActivity(ticket.id);
  await interaction.reply({ content: `🙋 Claimed by ${interaction.user}.` });
  const msg = interaction.message;
  await msg.edit({ components: [ticketControlsRow(true)] }).catch(() => {});
}

async function handleCloseButton(interaction) {
  const ticket = db.getTicketByChannel(interaction.channelId);
  if (!ticket) return interaction.reply({ content: "This isn't a ticket channel.", ephemeral: true });
  if (ticket.status === "closed") {
    return interaction.reply({ content: "This ticket is already closed.", ephemeral: true });
  }
  await interaction.reply({ content: `Ticket closed by ${interaction.user}. Deleting channel shortly...` });
  await closeTicketChannel(interaction.client, ticket, interaction.user.tag);
}

/** Bumps a ticket's last-activity timestamp on any message inside it (for auto-close). */
async function touchTicketOnMessage(message) {
  if (!message.guildId) return;
  const ticket = db.getTicketByChannel(message.channelId);
  if (ticket && ticket.status === "open") db.touchTicketActivity(ticket.id);
}

module.exports = {
  handleCreateButton,
  handleReasonModalSubmit,
  handleClaimButton,
  handleCloseButton,
  touchTicketOnMessage,
  ticketControlsRow,
  accountAgeDays,
};
