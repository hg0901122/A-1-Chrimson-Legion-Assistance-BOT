const express = require("express");
const db = require("../../shared/db");
const { buildAuthUrl } = require("../auth");
const { accountAgeDays } = require("../../shared/discordUtils");
const { postApplicationSubmission } = require("../../shared/applicationActions");

module.exports = function applyRoutes(client) {
  const router = express.Router();

  // IP blacklist is guild-scoped, so the actual check happens inside loadSession()
  // below, once we know which guild this token's application belongs to.
  function loadSession(req, res, next) {
    const session = db.getApplicationSession(req.params.token);
    if (!session) return res.render("apply-blocked", { reason: "This application link doesn't exist or has expired." });
    if (session.completed) return res.render("apply-blocked", { reason: "This application has already been submitted." });
    if (Date.now() > session.expires_at) {
      return res.render("apply-blocked", { reason: "This application link has expired. Run /join again to get a new one." });
    }
    if (db.isIpBlacklisted(session.guild_id, req.ip)) {
      return res.render("apply-blocked", { reason: "Your network has been blocked from submitting applications." });
    }
    if (db.isBlacklisted(session.guild_id, session.user_id)) {
      return res.render("apply-blocked", { reason: "You are blacklisted from submitting applications." });
    }
    req.applySession = session;
    next();
  }

  router.get("/:token", loadSession, (req, res) => {
    const session = req.applySession;
    const appType = db.getApplicationType(session.application_type_id);
    if (!appType || !appType.enabled) {
      return res.render("apply-blocked", { reason: "This application is no longer accepting submissions." });
    }

    if (!session.verified) {
      return res.render("apply-login", { appType, loginUrl: `/apply/${session.token}/login` });
    }

    const cfg = db.getGuildConfig(session.guild_id);
    const attemptNumber = db.countPriorAttempts(session.guild_id, appType.id, session.user_id) + 1;
    const challenge = makeCaptchaChallenge();
    if (cfg.captcha_enabled) req.session.captchaAnswer = challenge.answer;

    res.render("apply-form", {
      appType,
      session,
      attemptNumber,
      captchaEnabled: !!cfg.captcha_enabled,
      captchaQuestion: cfg.captcha_enabled ? challenge.question : null,
    });
  });

  router.get("/:token/login", loadSession, (req, res) => {
    res.redirect(buildAuthUrl(`apply:${req.params.token}`));
  });

  router.post("/:token/submit", loadSession, async (req, res) => {
    const session = req.applySession;
    const appType = db.getApplicationType(session.application_type_id);
    if (!appType || !appType.enabled) {
      return res.render("apply-blocked", { reason: "This application is no longer accepting submissions." });
    }
    if (!session.verified) {
      return res.render("apply-login", { appType, loginUrl: `/apply/${session.token}/login` });
    }

    const cfg = db.getGuildConfig(session.guild_id);

    if (cfg.captcha_enabled) {
      const expected = String(req.session.captchaAnswer ?? "");
      if (!expected || String(req.body.captcha_answer || "").trim() !== expected) {
        return res.render("apply-form", {
          appType,
          session,
          attemptNumber: db.countPriorAttempts(session.guild_id, appType.id, session.user_id) + 1,
          captchaEnabled: true,
          captchaQuestion: (() => {
            const c = makeCaptchaChallenge();
            req.session.captchaAnswer = c.answer;
            return c.question;
          })(),
          error: "That verification answer wasn't right — please try again.",
        });
      }
    }

    if (cfg.min_account_age_days_application > 0 && accountAgeDays(session.user_id) < cfg.min_account_age_days_application) {
      return res.render("apply-blocked", {
        reason: `Your Discord account must be at least ${cfg.min_account_age_days_application} day(s) old to apply.`,
      });
    }

    const last = db.getLastApplication(session.guild_id, appType.id, session.user_id);
    if (last && last.status === "pending") {
      return res.render("apply-blocked", {
        reason: `You already have a pending application (attempt #${last.attempt_number}). Please wait for it to be reviewed.`,
      });
    }

    const answers = appType.questions.map((q, i) => ({
      label: q.label,
      value: (req.body[`q_${i}`] || "").toString().slice(0, 4000),
    }));

    const missingRequired = appType.questions.some((q, i) => q.required !== false && !answers[i].value.trim());
    if (missingRequired) {
      return res.render("apply-form", {
        appType,
        session,
        attemptNumber: db.countPriorAttempts(session.guild_id, appType.id, session.user_id) + 1,
        captchaEnabled: !!cfg.captcha_enabled,
        captchaQuestion: null,
        error: "Please fill in all required questions.",
        prefill: req.body,
      });
    }

    const attemptNumber = db.countPriorAttempts(session.guild_id, appType.id, session.user_id) + 1;
    const app = db.createApplication({
      guild_id: session.guild_id,
      application_type_id: appType.id,
      user_id: session.user_id,
      username: session.username,
      attempt_number: attemptNumber,
      answers,
      log_channel_id: appType.log_channel_id,
      submitted_via: "portal",
      submitted_ip: req.ip,
    });

    db.completeApplicationSession(session.token);
    delete req.session.captchaAnswer;

    await postApplicationSubmission(client, app, appType);

    res.render("apply-done", { appType, attemptNumber });
  });

  return router;
};

/** A lightweight bot-check challenge — not a real CAPTCHA, but stops trivial scripted spam. */
function makeCaptchaChallenge() {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  return { question: `What is ${a} + ${b}?`, answer: String(a + b) };
}
