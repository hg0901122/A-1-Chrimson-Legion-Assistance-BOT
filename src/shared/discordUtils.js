/** Computes a Discord user's account age in days from their snowflake ID. */
function accountAgeDays(userId) {
  const DISCORD_EPOCH = 1420070400000n;
  const timestamp = Number((BigInt(userId) >> 22n) + DISCORD_EPOCH);
  return (Date.now() - timestamp) / 86_400_000;
}

module.exports = { accountAgeDays };
