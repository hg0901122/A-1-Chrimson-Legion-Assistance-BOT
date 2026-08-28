const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const db = require("../../shared/db");
const { postApplicationSubmission } = require("../../shared/applicationActions");
const { accountAgeDays } = require("../../shared/discordUtils");

const QUESTIONS_PER_MODAL = 5;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildModal(appType, step) {
  const chunks = chunk(appType.questions, QUESTIONS_PER_MODAL);
  const group = chunks[step];
  const modal = new ModalBuilder()
    .setCustomId(`application_modal_${appType.id}_${step}`)
    .setTitle(`${appType.name} (${step + 1}/${chunks.length})`.slice(0, 45));

  group.forEach((q, i) => {
    const input = new TextInputBuilder()
      .setCustomId(`q_${step * QUESTIONS_PER_MODAL + i}`)
      .setLabel(q.label.slice(0, 45))
      .setStyle(q.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required !== false);
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    if (q.maxLength) input.setMaxLength(Math.min(q.maxLength, 4000));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return modal;
}

/** Returns a blocking message if the applicant can't apply right now, else null. */
function checkEligibility(guildId, appType, userId) {
  const cfg = db.getGuildConfig(guildId);

  if (db.isBlacklisted(guildId, userId)) {
    return "🚫 You are blacklisted and cannot submit applications.";
  }
  if (cfg.min_account_age_days_application > 0 && accountAgeDays(userId) < cfg.min_account_age_days_application) {
    return `Your account must be at least ${cfg.min_account_age_days_application} day(s) old to apply.`;
  }

  const last = db.getLastApplication(guildId, appType.id, userId);
  if (last && last.status === "pending") {
    return `You already have a pending **${appType.name}** application (attempt #${last.attempt_number}). Please wait for it to be reviewed.`;
  }
  if (last && appType.cooldown_hours > 0 && last.reviewed_at) {
    const elapsedHrs = (Date.now() - last.reviewed_at) / 3_600_000;
    if (elapsedHrs < appType.cooldown_hours) {
      const remaining = (appType.cooldown_hours - elapsedHrs).toFixed(1);
      return `You must wait ${remaining} more hour(s) before reapplying to **${appType.name}**.`;
    }
  }
  if (!appType.questions.length) {
    return "This application has no questions configured yet. Contact staff.";
  }
  return null;
}

/**
 * Entry point from /join or the type picker.
 * Portal-mode applications get a link to the web form; otherwise shows the first Discord modal.
 */
async function startApplication(interaction, appType) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const reply = (payload) => (interaction.reply ? interaction.reply(payload) : interaction.update(payload));

  const blocked = checkEligibility(guildId, appType, userId);
  if (blocked) return reply({ content: blocked, ephemeral: true });

  if (appType.portal_mode) {
    const session = db.createApplicationSession(guildId, appType.id, userId, interaction.user.tag);
    const url = `${process.env.DASHBOARD_URL}/apply/${session.token}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Open Application Portal").setStyle(ButtonStyle.Link).setURL(url)
    );
    return reply({
      content: `**${appType.name}** is submitted through our web portal. Click below to continue — you'll need to sign in with Discord to verify it's you. This link expires in 60 minutes.`,
      components: [row],
      ephemeral: true,
    });
  }

  db.clearDraft(userId, appType.id);
  await interaction.showModal(buildModal(appType, 0));
}

/** Handles StringSelectMenu "join_select_type" interaction. */
async function handleTypeSelect(interaction) {
  const appType = db.getApplicationType(Number(interaction.values[0]));
  if (!appType || !appType.enabled) {
    return interaction.update({ content: "That application is no longer available.", components: [] });
  }
  await startApplication(interaction, appType);
}

/** Handles a modal submission for any step of any application type. */
async function handleModalSubmit(interaction) {
  const [, , typeId, stepStr] = interaction.customId.split("_");
  const appType = db.getApplicationType(Number(typeId));
  const step = Number(stepStr);
  if (!appType) {
    return interaction.reply({ content: "This application no longer exists.", ephemeral: true });
  }

  const chunks = chunk(appType.questions, QUESTIONS_PER_MODAL);
  const group = chunks[step];
  const draft = db.getDraft(interaction.user.id, appType.id) || { answers: [] };
  const answers = [...draft.answers];

  group.forEach((q, i) => {
    const idx = step * QUESTIONS_PER_MODAL + i;
    answers[idx] = { label: q.label, value: interaction.fields.getTextInputValue(`q_${idx}`) };
  });

  const nextStep = step + 1;
  if (nextStep < chunks.length) {
    db.saveDraft(interaction.user.id, appType.id, nextStep, answers);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`application_continue_${appType.id}_${nextStep}`)
        .setLabel(`Continue (${nextStep + 1}/${chunks.length})`)
        .setStyle(ButtonStyle.Primary)
    );
    return interaction.reply({
      content: "Saved! Click continue to answer the remaining questions.",
      components: [row],
      ephemeral: true,
    });
  }

  // Final step — submit the application.
  db.clearDraft(interaction.user.id, appType.id);
  const attemptNumber = db.countPriorAttempts(interaction.guildId, appType.id, interaction.user.id) + 1;

  const app = db.createApplication({
    guild_id: interaction.guildId,
    application_type_id: appType.id,
    user_id: interaction.user.id,
    username: interaction.user.tag,
    attempt_number: attemptNumber,
    answers,
    log_channel_id: appType.log_channel_id,
    submitted_via: "discord",
  });

  await interaction.reply({
    content: `✅ Your **${appType.name}** application has been submitted. This is attempt **#${attemptNumber}**.`,
    ephemeral: true,
  });

  await postApplicationSubmission(interaction.client, app, appType);
}

/** Handles the "Continue" button between modal steps. */
async function handleContinueButton(interaction) {
  const [, , typeId, stepStr] = interaction.customId.split("_");
  const appType = db.getApplicationType(Number(typeId));
  const step = Number(stepStr);
  if (!appType) {
    return interaction.update({ content: "This application no longer exists.", components: [] });
  }
  await interaction.showModal(buildModal(appType, step));
}

module.exports = { startApplication, handleTypeSelect, handleModalSubmit, handleContinueButton, checkEligibility };
