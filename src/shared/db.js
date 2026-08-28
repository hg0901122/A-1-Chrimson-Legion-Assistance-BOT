const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "bot.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  staff_role_id TEXT,
  ticket_category_id TEXT,
  ticket_log_channel_id TEXT,
  embed_color TEXT DEFAULT '5865F2',
  footer_text TEXT DEFAULT '',
  welcome_message TEXT DEFAULT 'Welcome {user}! Staff will be with you shortly.',
  ticket_name_format TEXT DEFAULT 'ticket-{username}',
  max_open_tickets_per_user INTEGER DEFAULT 1,
  auto_close_inactive_hours INTEGER DEFAULT 0,
  require_reason_on_ticket INTEGER DEFAULT 0,
  transcript_enabled INTEGER DEFAULT 1,
  transcript_channel_id TEXT,
  dm_on_ticket_open INTEGER DEFAULT 1,
  dm_on_ticket_close INTEGER DEFAULT 1,
  dm_on_application_submit INTEGER DEFAULT 1,
  min_account_age_days_ticket INTEGER DEFAULT 0,
  min_account_age_days_application INTEGER DEFAULT 0,
  captcha_enabled INTEGER DEFAULT 0,
  portal_default_enabled INTEGER DEFAULT 0,
  command_prefix TEXT DEFAULT '!'
);

CREATE TABLE IF NOT EXISTS application_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  questions TEXT NOT NULL DEFAULT '[]',
  log_channel_id TEXT,
  review_ping_role_id TEXT,
  accepted_role_id TEXT,
  denied_role_id TEXT,
  cooldown_hours INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  portal_mode INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  application_type_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  attempt_number INTEGER NOT NULL,
  answers TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  log_channel_id TEXT,
  message_id TEXT,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  submitted_via TEXT DEFAULT 'discord',
  submitted_ip TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (application_type_id) REFERENCES application_types(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_drafts (
  user_id TEXT NOT NULL,
  application_type_id INTEGER NOT NULL,
  step INTEGER NOT NULL DEFAULT 0,
  answers TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, application_type_id)
);

CREATE TABLE IF NOT EXISTS application_sessions (
  token TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  application_type_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  verified INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT,
  user_id TEXT NOT NULL,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  claimed_by TEXT,
  reason TEXT DEFAULT '',
  closed_by TEXT,
  closed_at INTEGER,
  last_activity_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blacklist (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  reason TEXT DEFAULT '',
  blacklisted_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS ip_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  ip TEXT NOT NULL,
  reason TEXT DEFAULT '',
  added_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(guild_id, ip)
);

CREATE TABLE IF NOT EXISTS custom_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  response TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(guild_id, trigger)
);

CREATE TABLE IF NOT EXISTS staff_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'staff',
  added_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS bot_managers (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  added_by TEXT,
  created_at INTEGER NOT NULL
);
`);

// Lightweight migration: add any columns that didn't exist in earlier installs.
function ensureColumns(table, columnDefs) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, def] of Object.entries(columnDefs)) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
    }
  }
}
ensureColumns("guild_config", {
  embed_color: "TEXT DEFAULT '5865F2'",
  footer_text: "TEXT DEFAULT ''",
  welcome_message: "TEXT DEFAULT 'Welcome {user}! Staff will be with you shortly.'",
  ticket_name_format: "TEXT DEFAULT 'ticket-{username}'",
  max_open_tickets_per_user: "INTEGER DEFAULT 1",
  auto_close_inactive_hours: "INTEGER DEFAULT 0",
  require_reason_on_ticket: "INTEGER DEFAULT 0",
  transcript_enabled: "INTEGER DEFAULT 1",
  transcript_channel_id: "TEXT",
  dm_on_ticket_open: "INTEGER DEFAULT 1",
  dm_on_ticket_close: "INTEGER DEFAULT 1",
  dm_on_application_submit: "INTEGER DEFAULT 1",
  min_account_age_days_ticket: "INTEGER DEFAULT 0",
  min_account_age_days_application: "INTEGER DEFAULT 0",
  captcha_enabled: "INTEGER DEFAULT 0",
  portal_default_enabled: "INTEGER DEFAULT 0",
  command_prefix: "TEXT DEFAULT '!'",
});
ensureColumns("application_types", { portal_mode: "INTEGER DEFAULT 0" });
ensureColumns("applications", { submitted_via: "TEXT DEFAULT 'discord'", submitted_ip: "TEXT" });
ensureColumns("tickets", { last_activity_at: "INTEGER" });

// ---------- guild_config ----------
function getGuildConfig(guildId) {
  let row = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
  if (!row) {
    db.prepare("INSERT INTO guild_config (guild_id) VALUES (?)").run(guildId);
    row = db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
  }
  return row;
}

function updateGuildConfig(guildId, fields) {
  getGuildConfig(guildId); // ensure row exists
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE guild_config SET ${setClause} WHERE guild_id = @guild_id`).run({
    ...fields,
    guild_id: guildId,
  });
}

// ---------- application_types ----------
function createApplicationType(guildId, data) {
  const stmt = db.prepare(`
    INSERT INTO application_types
      (guild_id, name, description, questions, log_channel_id, review_ping_role_id, accepted_role_id, denied_role_id, cooldown_hours, enabled, portal_mode, created_at)
    VALUES (@guild_id, @name, @description, @questions, @log_channel_id, @review_ping_role_id, @accepted_role_id, @denied_role_id, @cooldown_hours, @enabled, @portal_mode, @created_at)
  `);
  const info = stmt.run({
    guild_id: guildId,
    name: data.name,
    description: data.description || "",
    questions: JSON.stringify(data.questions || []),
    log_channel_id: data.log_channel_id || null,
    review_ping_role_id: data.review_ping_role_id || null,
    accepted_role_id: data.accepted_role_id || null,
    denied_role_id: data.denied_role_id || null,
    cooldown_hours: data.cooldown_hours || 0,
    enabled: data.enabled === false ? 0 : 1,
    portal_mode: data.portal_mode ? 1 : 0,
    created_at: Date.now(),
  });
  return getApplicationType(info.lastInsertRowid);
}

function updateApplicationType(id, data) {
  const existing = getApplicationType(id);
  if (!existing) return null;
  const merged = {
    name: data.name ?? existing.name,
    description: data.description ?? existing.description,
    questions: data.questions ? JSON.stringify(data.questions) : existing.questions,
    log_channel_id: data.log_channel_id ?? existing.log_channel_id,
    review_ping_role_id: data.review_ping_role_id ?? existing.review_ping_role_id,
    accepted_role_id: data.accepted_role_id ?? existing.accepted_role_id,
    denied_role_id: data.denied_role_id ?? existing.denied_role_id,
    cooldown_hours: data.cooldown_hours ?? existing.cooldown_hours,
    enabled: data.enabled === undefined ? existing.enabled : data.enabled ? 1 : 0,
    portal_mode: data.portal_mode === undefined ? existing.portal_mode : data.portal_mode ? 1 : 0,
  };
  db.prepare(`
    UPDATE application_types SET
      name = @name, description = @description, questions = @questions,
      log_channel_id = @log_channel_id, review_ping_role_id = @review_ping_role_id,
      accepted_role_id = @accepted_role_id, denied_role_id = @denied_role_id,
      cooldown_hours = @cooldown_hours, enabled = @enabled, portal_mode = @portal_mode
    WHERE id = @id
  `).run({ ...merged, id });
  return getApplicationType(id);
}

function deleteApplicationType(id) {
  db.prepare("DELETE FROM application_types WHERE id = ?").run(id);
}

function getApplicationType(id) {
  const row = db.prepare("SELECT * FROM application_types WHERE id = ?").get(id);
  return row ? deserializeAppType(row) : null;
}

function listApplicationTypes(guildId, { onlyEnabled = false } = {}) {
  const rows = onlyEnabled
    ? db.prepare("SELECT * FROM application_types WHERE guild_id = ? AND enabled = 1 ORDER BY id").all(guildId)
    : db.prepare("SELECT * FROM application_types WHERE guild_id = ? ORDER BY id").all(guildId);
  return rows.map(deserializeAppType);
}

function deserializeAppType(row) {
  return { ...row, questions: JSON.parse(row.questions || "[]"), enabled: !!row.enabled, portal_mode: !!row.portal_mode };
}

// ---------- applications ----------
function countPriorAttempts(guildId, applicationTypeId, userId) {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS c FROM applications WHERE guild_id = ? AND application_type_id = ? AND user_id = ?"
    )
    .get(guildId, applicationTypeId, userId);
  return row.c;
}

function getLastApplication(guildId, applicationTypeId, userId) {
  return db
    .prepare(
      `SELECT * FROM applications WHERE guild_id = ? AND application_type_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(guildId, applicationTypeId, userId);
}

function createApplication(data) {
  const stmt = db.prepare(`
    INSERT INTO applications
      (guild_id, application_type_id, user_id, username, attempt_number, answers, status, log_channel_id, submitted_via, submitted_ip, created_at)
    VALUES (@guild_id, @application_type_id, @user_id, @username, @attempt_number, @answers, 'pending', @log_channel_id, @submitted_via, @submitted_ip, @created_at)
  `);
  const info = stmt.run({
    guild_id: data.guild_id,
    application_type_id: data.application_type_id,
    user_id: data.user_id,
    username: data.username,
    attempt_number: data.attempt_number,
    answers: JSON.stringify(data.answers),
    log_channel_id: data.log_channel_id || null,
    submitted_via: data.submitted_via || "discord",
    submitted_ip: data.submitted_ip || null,
    created_at: Date.now(),
  });
  return getApplication(info.lastInsertRowid);
}

function setApplicationMessage(id, messageId) {
  db.prepare("UPDATE applications SET message_id = ? WHERE id = ?").run(messageId, id);
}

function reviewApplication(id, status, reviewerId) {
  db.prepare(
    "UPDATE applications SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?"
  ).run(status, reviewerId, Date.now(), id);
  return getApplication(id);
}

function getApplication(id) {
  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
  return row ? deserializeApp(row) : null;
}

function listApplications(guildId, { status, applicationTypeId, limit = 200 } = {}) {
  let query = "SELECT * FROM applications WHERE guild_id = ?";
  const params = [guildId];
  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  if (applicationTypeId) {
    query += " AND application_type_id = ?";
    params.push(applicationTypeId);
  }
  query += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);
  return db.prepare(query).all(...params).map(deserializeApp);
}

function deserializeApp(row) {
  return { ...row, answers: JSON.parse(row.answers || "[]") };
}

// ---------- application_drafts (multi-step modal chaining) ----------
function getDraft(userId, applicationTypeId) {
  const row = db
    .prepare("SELECT * FROM application_drafts WHERE user_id = ? AND application_type_id = ?")
    .get(userId, applicationTypeId);
  if (!row) return null;
  return { ...row, answers: JSON.parse(row.answers || "[]") };
}

function saveDraft(userId, applicationTypeId, step, answers) {
  db.prepare(`
    INSERT INTO application_drafts (user_id, application_type_id, step, answers, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, application_type_id) DO UPDATE SET step = excluded.step, answers = excluded.answers, updated_at = excluded.updated_at
  `).run(userId, applicationTypeId, step, JSON.stringify(answers), Date.now());
}

function clearDraft(userId, applicationTypeId) {
  db.prepare("DELETE FROM application_drafts WHERE user_id = ? AND application_type_id = ?").run(
    userId,
    applicationTypeId
  );
}

// ---------- application_sessions (web portal) ----------
function createApplicationSession(guildId, applicationTypeId, userId, username, ttlMinutes = 60) {
  const token = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  db.prepare(`
    INSERT INTO application_sessions (token, guild_id, application_type_id, user_id, username, verified, completed, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
  `).run(token, guildId, applicationTypeId, userId, username, now, now + ttlMinutes * 60_000);
  return getApplicationSession(token);
}

function getApplicationSession(token) {
  return db.prepare("SELECT * FROM application_sessions WHERE token = ?").get(token);
}

function verifyApplicationSession(token) {
  db.prepare("UPDATE application_sessions SET verified = 1 WHERE token = ?").run(token);
}

function completeApplicationSession(token) {
  db.prepare("UPDATE application_sessions SET completed = 1 WHERE token = ?").run(token);
}

// ---------- tickets ----------
function createTicket(data) {
  const stmt = db.prepare(`
    INSERT INTO tickets (guild_id, channel_id, user_id, username, status, reason, last_activity_at, created_at)
    VALUES (@guild_id, @channel_id, @user_id, @username, 'open', @reason, @created_at, @created_at)
  `);
  const info = stmt.run({
    guild_id: data.guild_id,
    channel_id: data.channel_id,
    user_id: data.user_id,
    username: data.username,
    reason: data.reason || "",
    created_at: Date.now(),
  });
  return getTicket(info.lastInsertRowid);
}

function getTicket(id) {
  return db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
}

function getTicketByChannel(channelId) {
  return db.prepare("SELECT * FROM tickets WHERE channel_id = ?").get(channelId);
}

function claimTicket(id, staffId) {
  db.prepare("UPDATE tickets SET claimed_by = ? WHERE id = ?").run(staffId, id);
}

function touchTicketActivity(id) {
  db.prepare("UPDATE tickets SET last_activity_at = ? WHERE id = ?").run(Date.now(), id);
}

function closeTicket(id, closedBy) {
  db.prepare("UPDATE tickets SET status = 'closed', closed_by = ?, closed_at = ? WHERE id = ?").run(
    closedBy,
    Date.now(),
    id
  );
}

function listTickets(guildId, { status, limit = 200 } = {}) {
  let query = "SELECT * FROM tickets WHERE guild_id = ?";
  const params = [guildId];
  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  query += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);
  return db.prepare(query).all(...params);
}

function listStaleOpenTickets(guildId, hours) {
  const cutoff = Date.now() - hours * 3_600_000;
  return db
    .prepare("SELECT * FROM tickets WHERE guild_id = ? AND status = 'open' AND last_activity_at < ?")
    .all(guildId, cutoff);
}

function countOpenTicketsForUser(guildId, userId) {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'")
    .get(guildId, userId);
  return row.c;
}

// ---------- transcripts ----------
function saveTranscript(ticketId, guildId, content) {
  db.prepare("INSERT INTO transcripts (ticket_id, guild_id, content, created_at) VALUES (?, ?, ?, ?)").run(
    ticketId,
    guildId,
    content,
    Date.now()
  );
}

function getTranscriptForTicket(ticketId) {
  return db
    .prepare("SELECT * FROM transcripts WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(ticketId);
}

// ---------- blacklist (users) ----------
function addBlacklist(guildId, userId, username, reason, staffId) {
  db.prepare(`
    INSERT INTO blacklist (guild_id, user_id, username, reason, blacklisted_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET username = excluded.username, reason = excluded.reason, blacklisted_by = excluded.blacklisted_by, created_at = excluded.created_at
  `).run(guildId, userId, username, reason || "", staffId, Date.now());
}

function removeBlacklist(guildId, userId) {
  db.prepare("DELETE FROM blacklist WHERE guild_id = ? AND user_id = ?").run(guildId, userId);
}

function isBlacklisted(guildId, userId) {
  return !!db
    .prepare("SELECT 1 FROM blacklist WHERE guild_id = ? AND user_id = ?")
    .get(guildId, userId);
}

function listBlacklist(guildId) {
  return db
    .prepare("SELECT * FROM blacklist WHERE guild_id = ? ORDER BY created_at DESC")
    .all(guildId);
}

// ---------- IP blacklist ----------
function addIpBlacklist(guildId, ip, reason, staffId) {
  db.prepare(`
    INSERT INTO ip_blacklist (guild_id, ip, reason, added_by, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, ip) DO UPDATE SET reason = excluded.reason, added_by = excluded.added_by, created_at = excluded.created_at
  `).run(guildId, ip, reason || "", staffId, Date.now());
}

function removeIpBlacklist(guildId, ip) {
  db.prepare("DELETE FROM ip_blacklist WHERE guild_id = ? AND ip = ?").run(guildId, ip);
}

function isIpBlacklisted(guildId, ip) {
  if (!ip) return false;
  return !!db.prepare("SELECT 1 FROM ip_blacklist WHERE guild_id = ? AND ip = ?").get(guildId, ip);
}

function listIpBlacklist(guildId) {
  return db.prepare("SELECT * FROM ip_blacklist WHERE guild_id = ? ORDER BY created_at DESC").all(guildId);
}

// ---------- custom commands ----------
function createCustomCommand(guildId, trigger, response, createdBy) {
  db.prepare(`
    INSERT INTO custom_commands (guild_id, trigger, response, created_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, trigger.toLowerCase(), response, createdBy, Date.now());
}

function updateCustomCommand(id, response) {
  db.prepare("UPDATE custom_commands SET response = ? WHERE id = ?").run(response, id);
}

function deleteCustomCommand(id) {
  db.prepare("DELETE FROM custom_commands WHERE id = ?").run(id);
}

function listCustomCommands(guildId) {
  return db.prepare("SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY trigger").all(guildId);
}

function getCustomCommand(guildId, trigger) {
  return db
    .prepare("SELECT * FROM custom_commands WHERE guild_id = ? AND trigger = ?")
    .get(guildId, trigger.toLowerCase());
}

// ---------- staff members (dashboard access) ----------
function addStaffMember(guildId, userId, username, role, addedBy) {
  db.prepare(`
    INSERT INTO staff_members (guild_id, user_id, username, role, added_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET username = excluded.username, role = excluded.role, added_by = excluded.added_by
  `).run(guildId, userId, username, role || "staff", addedBy, Date.now());
}

function removeStaffMember(guildId, userId) {
  db.prepare("DELETE FROM staff_members WHERE guild_id = ? AND user_id = ?").run(guildId, userId);
}

function listStaffMembers(guildId) {
  return db.prepare("SELECT * FROM staff_members WHERE guild_id = ? ORDER BY created_at").all(guildId);
}

function getStaffMember(guildId, userId) {
  return db.prepare("SELECT * FROM staff_members WHERE guild_id = ? AND user_id = ?").get(guildId, userId);
}

// ---------- bot managers (global, cross-guild superusers) ----------
function addBotManager(userId, username, addedBy) {
  db.prepare(`
    INSERT INTO bot_managers (user_id, username, added_by, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, added_by = excluded.added_by
  `).run(userId, username, addedBy, Date.now());
}

function removeBotManager(userId) {
  db.prepare("DELETE FROM bot_managers WHERE user_id = ?").run(userId);
}

function listBotManagers() {
  return db.prepare("SELECT * FROM bot_managers ORDER BY created_at").all();
}

function isBotManagerInDb(userId) {
  return !!db.prepare("SELECT 1 FROM bot_managers WHERE user_id = ?").get(userId);
}

module.exports = {
  db,
  getGuildConfig,
  updateGuildConfig,
  createApplicationType,
  updateApplicationType,
  deleteApplicationType,
  getApplicationType,
  listApplicationTypes,
  countPriorAttempts,
  getLastApplication,
  createApplication,
  setApplicationMessage,
  reviewApplication,
  getApplication,
  listApplications,
  getDraft,
  saveDraft,
  clearDraft,
  createApplicationSession,
  getApplicationSession,
  verifyApplicationSession,
  completeApplicationSession,
  createTicket,
  getTicket,
  getTicketByChannel,
  claimTicket,
  touchTicketActivity,
  closeTicket,
  listTickets,
  listStaleOpenTickets,
  countOpenTicketsForUser,
  saveTranscript,
  getTranscriptForTicket,
  addBlacklist,
  removeBlacklist,
  isBlacklisted,
  listBlacklist,
  addIpBlacklist,
  removeIpBlacklist,
  isIpBlacklisted,
  listIpBlacklist,
  createCustomCommand,
  updateCustomCommand,
  deleteCustomCommand,
  listCustomCommands,
  getCustomCommand,
  addStaffMember,
  removeStaffMember,
  listStaffMembers,
  getStaffMember,
  addBotManager,
  removeBotManager,
  listBotManagers,
  isBotManagerInDb,
};
