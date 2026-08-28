const db = require("./db");

/** Builds a plain-text transcript from the last messages in a ticket channel. */
async function buildTranscript(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const ordered = [...messages.values()].reverse();
    const lines = ordered.map((m) => {
      const time = new Date(m.createdTimestamp).toISOString();
      const author = m.author ? `${m.author.tag} (${m.author.id})` : "Unknown";
      const content = m.content || "[no text content]";
      return `[${time}] ${author}: ${content}`;
    });
    return lines.join("\n") || "(no messages)";
  } catch (err) {
    return `(transcript unavailable: ${err.message})`;
  }
}

/**
 * Closes a ticket: marks it closed in the DB, saves a transcript, posts a
 * summary to the ticket log / transcript channel, and deletes the channel.
 */
async function closeTicketChannel(client, ticket, closedByTag, { deleteChannel = true } = {}) {
  db.closeTicket(ticket.id, closedByTag);
  const cfg = db.getGuildConfig(ticket.guild_id);
  const color = parseInt(cfg.embed_color || "5865F2", 16) || 0xed4245;

  let transcriptText = null;
  let channel = null;
  try {
    if (ticket.channel_id) channel = await client.channels.fetch(ticket.channel_id);
  } catch {
    // channel already gone
  }

  if (cfg.transcript_enabled && channel) {
    transcriptText = await buildTranscript(channel);
    db.saveTranscript(ticket.id, ticket.guild_id, transcriptText);
  }

  const logChannelId = cfg.transcript_channel_id || cfg.ticket_log_channel_id;
  if (logChannelId) {
    try {
      const logChannel = await client.channels.fetch(logChannelId);
      if (logChannel?.isTextBased()) {
        const files = [];
        if (transcriptText) {
          const { AttachmentBuilder } = require("discord.js");
          files.push(
            new AttachmentBuilder(Buffer.from(transcriptText, "utf-8"), {
              name: `ticket-${ticket.id}-transcript.txt`,
            })
          );
        }
        await logChannel.send({
          embeds: [
            {
              title: `Ticket #${ticket.id} closed`,
              color,
              fields: [
                { name: "Opened by", value: `<@${ticket.user_id}>`, inline: true },
                { name: "Closed by", value: closedByTag, inline: true },
                { name: "Claimed by", value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : "Unclaimed", inline: true },
              ],
              footer: cfg.footer_text ? { text: cfg.footer_text } : undefined,
              timestamp: new Date().toISOString(),
            },
          ],
          files,
        });
      }
    } catch (err) {
      console.error("Failed to post ticket log:", err.message);
    }
  }

  if (cfg.dm_on_ticket_close) {
    try {
      const user = await client.users.fetch(ticket.user_id);
      await user.send(`Your ticket #${ticket.id} has been closed by ${closedByTag}.`).catch(() => {});
    } catch {
      // user unreachable, ignore
    }
  }

  if (deleteChannel && channel) {
    try {
      await channel.send("This ticket will be deleted in 5 seconds.");
      setTimeout(() => channel.delete().catch(() => {}), 5000);
    } catch {
      // ignore
    }
  }
}

module.exports = { closeTicketChannel, buildTranscript };
