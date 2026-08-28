const { PermissionsBitField } = require("discord.js");
const db = require("./db");

/** User IDs granted from .env — a hardcoded root list that can't be locked out via the dashboard. */
function envBotManagerIds() {
  return (process.env.BOT_MANAGER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** True if this user is a global bot manager — beyond owner, in every guild, everywhere. */
function isBotManager(userId) {
  if (envBotManagerIds().includes(userId)) return true;
  return db.isBotManagerInDb(userId);
}

/**
 * Access levels, low to high: null (no access) < 'staff' < 'manager'.
 * 'manager' can configure settings, applications, staff, and everything 'staff' can do.
 * 'staff' can review applications/tickets but not change configuration.
 */
async function getAccessLevel(client, guildId, userId) {
  if (isBotManager(userId)) return "manager";

  const staffRow = db.getStaffMember(guildId, userId);
  if (staffRow) return staffRow.role === "manager" ? "manager" : "staff";

  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    if (
      member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return "manager";
    }
    const cfg = db.getGuildConfig(guildId);
    if (cfg.staff_role_id && member.roles.cache.has(cfg.staff_role_id)) return "staff";
  } catch {
    // not a member, or guild unreachable
  }

  return null;
}

async function hasAtLeast(client, guildId, userId, level) {
  const current = await getAccessLevel(client, guildId, userId);
  if (!current) return false;
  if (level === "staff") return true; // staff or manager both satisfy "staff"
  return current === "manager";
}

module.exports = { isBotManager, getAccessLevel, hasAtLeast, envBotManagerIds };
