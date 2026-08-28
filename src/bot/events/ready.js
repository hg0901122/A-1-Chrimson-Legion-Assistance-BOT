module.exports = function ready(client) {
  console.log(`Logged in as ${client.user.tag} (${client.guilds.cache.size} guild(s))`);
  client.user.setActivity("/join and /ticketpanel");
};
