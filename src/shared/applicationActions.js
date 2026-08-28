const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("./db");

function buildApplicationEmbed(app, appType, statusOverride) {
  const status = statusOverride || app.status;
  const color = status === "accepted" ? 0x57f287 : status === "denied" ? 0xed4245 : 0x5865f2;

  const embed = new EmbedBuilder()
    .setTitle(`${appType.name} — Application #${app.id}`)
    .setColor(color)
    .setDescription(
      `Submitted by <@${app.user_id}> (${app.username})${app.submitted_via === "portal" ? " · via web portal" : ""}`
    )
    .addFields(
      { name: "Attempt", value: `#${app.attempt_number}`, inline: true },
      { name: "Status", value: status[0].toUpperCase() + status.slice(1), inline: true }
    )
    .setTimestamp(app.created_at);

  for (const a of app.answers) {
    embed.addFields({
      name: a.label.slice(0, 256),
      value: (a.value || "*No answer*").slice(0, 1024),
    });
  }

  if (app.reviewed_by) {
    embed.setFooter({ text: `Reviewed by ${app.reviewed_by}` });
  }

  return embed;
}

function buildReviewRow(appId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_accept_${appId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`app_deny_${appId}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

/**
 * Posts a freshly-created application to its log channel with Accept/Deny
 * buttons, and DMs the applicant a submission confirmation if configured.
 * Shared by the Discord modal flow and the web portal flow.
 */
async function postApplicationSubmission(client, app, appType) {
  if (appType.log_channel_id) {
    try {
      const channel = await client.channels.fetch(appType.log_channel_id);
      if (channel?.isTextBased()) {
        const ping = appType.review_ping_role_id ? `<@&${appType.review_ping_role_id}>` : undefined;
        const msg = await channel.send({
          content: ping,
          embeds: [buildApplicationEmbed(app, appType)],
          components: [buildReviewRow(app.id)],
        });
        db.setApplicationMessage(app.id, msg.id);
      }
    } catch (err) {
      console.error("Failed to post application to log channel:", err.message);
    }
  }

  const cfg = db.getGuildConfig(app.guild_id);
  if (cfg.dm_on_application_submit) {
    try {
      const user = await client.users.fetch(app.user_id);
      await user
        .send(
          `✅ Your **${appType.name}** application has been submitted. This is attempt **#${app.attempt_number}**.`
        )
        .catch(() => {});
    } catch {
      // unreachable user, ignore
    }
  }
}

/**
 * Applies an accept/deny decision: updates DB, edits the log message (if reachable),
 * assigns roles, and DMs the applicant. Safe to call from a button interaction OR
 * from the dashboard (client-only, no interaction).
 */
async function decideApplication(client, applicationId, decision, reviewerTag) {
  const app = db.getApplication(applicationId);
  if (!app) throw new Error("Application not found");
  const appType = db.getApplicationType(app.application_type_id);
  if (!appType) throw new Error("Application type not found");

  const updated = db.reviewApplication(applicationId, decision, reviewerTag);

  // Edit the original log message, if we can reach it
  try {
    if (updated.log_channel_id && updated.message_id) {
      const channel = await client.channels.fetch(updated.log_channel_id);
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(updated.message_id);
        await message.edit({
          embeds: [buildApplicationEmbed(updated, appType)],
          components: [buildReviewRow(applicationId, true)],
        });
      }
    }
  } catch (err) {
    console.error("Failed to update application log message:", err.message);
  }

  // Role assignment + DM
  try {
    const guild = await client.guilds.fetch(updated.guild_id);
    const member = await guild.members.fetch(updated.user_id).catch(() => null);
    if (member) {
      const roleId = decision === "accepted" ? appType.accepted_role_id : appType.denied_role_id;
      if (roleId) {
        await member.roles.add(roleId).catch((e) => console.error("Role add failed:", e.message));
      }
    }
    const user = await client.users.fetch(updated.user_id).catch(() => null);
    if (user) {
      const verb = decision === "accepted" ? "accepted ✅" : "denied ❌";
      await user
        .send(
          `Your **${appType.name}** application (attempt #${updated.attempt_number}) has been ${verb}.`
        )
        .catch(() => {});
    }
  } catch (err) {
    console.error("Failed to notify applicant:", err.message);
  }

  return updated;
}

module.exports = { buildApplicationEmbed, buildReviewRow, postApplicationSubmission, decideApplication };
