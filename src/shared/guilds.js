/** Returns the list of guild IDs this bot/dashboard manages, from GUILD_IDS (comma-separated) or the legacy single GUILD_ID. */
function getConfiguredGuildIds() {
  const multi = (process.env.GUILD_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (multi.length > 0) return multi;
  return process.env.GUILD_ID ? [process.env.GUILD_ID] : [];
}

module.exports = { getConfiguredGuildIds };
