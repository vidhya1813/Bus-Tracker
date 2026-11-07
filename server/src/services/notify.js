// Email via Nodemailer (SMTP) and SMS via Twilio's REST API.
// When they are not configured, messages go to the console and a dev outbox
// (GET /api/dev/outbox) so the whole flow can be demoed without accounts.
import nodemailer from 'nodemailer';
import { config } from '../config.js';

const outbox = [];
const MAX_OUTBOX = 50;

function record(entry) {
  outbox.unshift({ ...entry, at: new Date().toISOString() });
  outbox.length = Math.min(outbox.length, MAX_OUTBOX);
}

export const getOutbox = () => outbox;

const transporter = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  : null;

export async function sendEmail({ to, subject, text, html, attachments }) {
  if (!to) return;
  if (!transporter) {
    console.log(`\n[email -> ${to}] ${subject}\n${text}\n`);
    record({ channel: 'email', to, subject, text, html });
    return;
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, text, html, attachments });
}

export async function sendSms({ to, body }) {
  if (!to) return;
  const { sid, token, from } = config.twilio;
  if (!sid) {
    console.log(`\n[sms -> ${to}] ${body}\n`);
    record({ channel: 'sms', to, text: body });
    return;
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio error ${res.status}: ${await res.text()}`);
}

/** True when a real email/SMS channel exists for this identifier type. */
export const canDeliver = (channel) => (channel === 'email' ? !!transporter : !!config.twilio.sid);
