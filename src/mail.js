// Email: sends through your SMTP server (e.g. Microsoft 365) when SMTP_* settings are present.
// Until then each email is saved as an .eml file in data/outbox so nothing is lost.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { DATA_DIR } = require('./db');

const ENQUIRY_TO = process.env.ENQUIRY_TO || 'admin@elsonwhiteconsulting.com.au';
const FROM = process.env.MAIL_FROM || 'Elson White Consulting <admin@elsonwhiteconsulting.com.au>';

let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_PORT) === '465',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

async function send(msg) {
  const full = { from: FROM, ...msg };
  if (transport) {
    try { await transport.sendMail(full); return 'sent'; }
    catch (e) { console.error('Email failed:', e.message); }
  }
  const buf = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(full);
  const file = path.join(DATA_DIR, 'outbox', `${new Date().toISOString().replace(/[:.]/g, '-')}.eml`);
  fs.writeFileSync(file, buf.message);
  return transport ? 'failed (saved to outbox)' : 'saved to outbox (email not configured yet)';
}

module.exports = { send, ENQUIRY_TO, configured: () => !!transport };
