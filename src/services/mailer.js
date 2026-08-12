import nodemailer from 'nodemailer';
import config from '../config.js';
import { getDb } from '../db/index.js';
import { uid } from '../lib/ids.js';

/* Outbound mail is a two-step flow on purpose:
     queueEmail()  writes the message to the email log as `queued`
     flushEmails() hands queued messages to the transport and records the result
   Nothing is lost when SMTP is down — the row stays queued with a retry time,
   and the log is the single place to answer "was this person actually told?". */

let transport = null;
let transportKind = null;

export function getTransport() {
  if (transport) return transport;
  const m = config.mail;
  if (m.transport === 'smtp' && m.host) {
    transport = nodemailer.createTransport({
      host: m.host,
      port: m.port,
      secure: m.secure,
      auth: m.user ? { user: m.user, pass: m.pass } : undefined,
    });
    transportKind = 'smtp';
  } else if (m.transport === 'stream') {
    transport = nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
    transportKind = 'stream';
  } else {
    /* Nothing leaves the process, but the message is fully rendered and logged,
       so the delivery path is exercised end to end without a mail server. */
    transport = nodemailer.createTransport({ jsonTransport: true });
    transportKind = 'json';
  }
  return transport;
}

export function transportName() {
  if (!transport) getTransport();
  return transportKind;
}

export function resetTransport() {
  transport = null;
  transportKind = null;
}

export async function verifyTransport() {
  const t = getTransport();
  if (transportKind !== 'smtp') return { ok: true, transport: transportKind, note: 'local transport — messages are logged, not delivered' };
  try {
    await t.verify();
    return { ok: true, transport: 'smtp', host: config.mail.host, port: config.mail.port };
  } catch (err) {
    return { ok: false, transport: 'smtp', error: err.message };
  }
}

export function queueEmail({ toUser, toEmail, kind, task, subject, body, html }) {
  const address = config.mail.redirectAll || toEmail;
  if (!address) return null;
  const id = uid('em');
  getDb()
    .prepare(
      `INSERT INTO emails (id, to_user, to_email, kind, task, subject, body, html, state, attempts, next_try_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
    )
    .run(id, toUser || null, address, kind, task || null, subject, body || '', html || '', Date.now(), Date.now());
  return id;
}

export function suppressEmail({ toUser, toEmail, kind, task, subject, reason }) {
  const id = uid('em');
  getDb()
    .prepare(
      `INSERT INTO emails (id, to_user, to_email, kind, task, subject, body, html, state, attempts, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '', '', 'suppressed', 0, ?, ?)`,
    )
    .run(id, toUser || null, toEmail || '', kind, task || null, subject, reason, Date.now());
  return id;
}

function markSent(id, info) {
  getDb()
    .prepare(`UPDATE emails SET state='sent', attempts = attempts + 1, sent_at = ?, message_id = ?, error = NULL WHERE id = ?`)
    .run(Date.now(), info?.messageId || null, id);
}

function markFailure(id, attempts, message) {
  const db = getDb();
  const nextAttempts = attempts + 1;
  if (nextAttempts >= config.mail.maxAttempts) {
    db.prepare(`UPDATE emails SET state='failed', attempts = ?, error = ?, next_try_at = NULL WHERE id = ?`)
      .run(nextAttempts, message, id);
  } else {
    db.prepare(`UPDATE emails SET attempts = ?, error = ?, next_try_at = ? WHERE id = ?`)
      .run(nextAttempts, message, Date.now() + config.mail.retrySeconds * 1000, id);
  }
}

/** Sends every queued message whose retry time has come. Returns a summary. */
export async function flushEmails(limit = 50) {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM emails WHERE state = 'queued' AND (next_try_at IS NULL OR next_try_at <= ?) ORDER BY created_at LIMIT ?`)
    .all(Date.now(), limit);
  if (rows.length === 0) return { sent: 0, failed: 0, pending: 0 };

  const t = getTransport();
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const info = await t.sendMail({
        from: config.mail.from,
        to: row.to_email,
        replyTo: config.mail.replyTo || undefined,
        subject: row.subject,
        text: row.body,
        html: row.html || undefined,
      });
      markSent(row.id, info);
      sent += 1;
    } catch (err) {
      markFailure(row.id, row.attempts, String(err?.message || err).slice(0, 500));
      failed += 1;
    }
  }
  const pending = db.prepare(`SELECT COUNT(*) AS n FROM emails WHERE state = 'queued'`).get().n;
  return { sent, failed, pending };
}

export function emailLog({ limit = 100, userId = null, state = null } = {}) {
  const clauses = [];
  const params = [];
  if (userId) { clauses.push('to_user = ?'); params.push(userId); }
  if (state) { clauses.push('state = ?'); params.push(state); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.min(Number(limit) || 100, 500));
  return getDb().prepare(`SELECT * FROM emails ${where} ORDER BY created_at DESC LIMIT ?`).all(...params);
}
