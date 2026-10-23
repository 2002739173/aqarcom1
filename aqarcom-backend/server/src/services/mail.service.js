/**
 * Email (password-reset codes — FR-03). Without SMTP settings (development), the email is
 * written to the console instead so the flow can be tested end-to-end.
 */
const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporter = null;
if (env.smtp.host) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
}

/** Test hook: last message sent while no SMTP is configured (used by automated tests only). */
let lastDevMail = null;

async function send({ to, subject, text, html }) {
  if (!transporter) {
    lastDevMail = { to, subject, text };
    if (!env.isTest && !env.isProd) logger.info(`[DEV MAIL] to=${to} subject="${subject}"\n${text}`);
    return { dev: true };
  }
  return transporter.sendMail({ from: env.smtp.from, to, subject, text, html });
}

async function sendPasswordResetCode(to, name, code, ttlMinutes) {
  const text = `مرحباً ${name}،\n\nرمز إعادة تعيين كلمة المرور في عقاركم هو: ${code}\nالرمز صالح لمرة واحدة ولمدة ${ttlMinutes} دقيقة.\nإن لم تطلب ذلك فتجاهل هذه الرسالة.`;
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial">مرحباً ${name}،<br><br>رمز إعادة تعيين كلمة المرور في <b>عقاركم</b> هو:<h2 style="letter-spacing:6px">${code}</h2>الرمز صالح لمرة واحدة ولمدة ${ttlMinutes} دقيقة.<br>إن لم تطلب ذلك فتجاهل هذه الرسالة.</div>`;
  return send({ to, subject: 'عقاركم — رمز إعادة تعيين كلمة المرور', text, html });
}

module.exports = { send, sendPasswordResetCode, _lastDevMail: () => lastDevMail };
