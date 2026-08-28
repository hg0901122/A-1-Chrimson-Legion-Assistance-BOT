const db = require("../../shared/db");
const { decideApplication } = require("../../shared/applicationActions");
const applications = require("./applications");
const tickets = require("./tickets");

module.exports = async function interactionCreate(interaction) {
  try {
    // ---- Slash commands ----
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      return command.execute(interaction);
    }

    // ---- Select menus ----
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "join_select_type") {
        return applications.handleTypeSelect(interaction);
      }
      return;
    }

    // ---- Modals ----
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("application_modal_")) {
        return applications.handleModalSubmit(interaction);
      }
      if (interaction.customId === "ticket_reason_modal") {
        return tickets.handleReasonModalSubmit(interaction);
      }
      return;
    }

    // ---- Buttons ----
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === "ticket_create") return tickets.handleCreateButton(interaction);
      if (id === "ticket_claim") return tickets.handleClaimButton(interaction);
      if (id === "ticket_close") return tickets.handleCloseButton(interaction);

      if (id.startsWith("application_continue_")) {
        return applications.handleContinueButton(interaction);
      }

      if (id.startsWith("app_accept_") || id.startsWith("app_deny_")) {
        const isAccept = id.startsWith("app_accept_");
        const appId = Number(id.split("_")[2]);
        const app = db.getApplication(appId);
        if (!app) return interaction.reply({ content: "Application not found.", ephemeral: true });
        if (app.status !== "pending") {
          return interaction.reply({ content: `This application was already ${app.status}.`, ephemeral: true });
        }
        await interaction.deferUpdate();
        await decideApplication(interaction.client, appId, isAccept ? "accepted" : "denied", interaction.user.tag);
        return;
      }
    }
  } catch (err) {
    console.error("Interaction error:", err);
    const payload = { content: "Something went wrong handling that. Please try again.", ephemeral: true };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch {
      // interaction likely expired, nothing more we can do
    }
  }
};
