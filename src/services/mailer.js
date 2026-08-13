import nodemailer from 'nodemailer';
import config from '../config.js';
import { getDb } from '../db/index.js';
import { uid } from '../lib/auth.js';
import { NOTIF_LABELS } from '../lib/domain.js';

/* Mail is queued, then sent. A message is written to the log before anything is
   attempted, so a mail server that is down delays a notification instead of
   losing it — or failing the action that raised it. */

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
    /* Nothing leaves the process, but the message is fully rendered and logged
       so the path is exercised without a mail server. */
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
  if (transportKind !== 'smtp') {
    return { ok: true, transport: transportKind, note: 'ناقل محلي — تُسجَّل الرسائل ولا تُرسل' };
  }
  try {
    await t.verify();
    return { ok: true, transport: 'smtp', host: config.mail.host, port: config.mail.port };
  } catch (err) {
    return { ok: false, transport: 'smtp', error: err.message };
  }
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The house template: right-to-left, the same one the delivered build used. */
export function renderEmail({ event, title, rows = [], body = '', action = null }) {
  const label = NOTIF_LABELS[event] || event;
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:540px;margin:0 auto;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
<div style="background:linear-gradient(to left,#0ea5e9,#2563eb);padding:18px 22px;color:#fff"><div style="font-size:20px;font-weight:800">متابِع</div><div style="font-size:12px;color:#bae6fd">نظام متابعة المهام</div></div>
<div style="padding:20px">
<div style="background:#fff;border-radius:8px;border:1px solid #e2e8f0;padding:14px;margin-bottom:14px">
<div style="font-size:12px;color:#64748b;margin-bottom:4px">${esc(label)}</div>
<div style="font-size:16px;font-weight:700;color:#0f172a">${esc(title)}</div>
${body ? `<div style="font-size:13px;color:#475569;margin-top:8px;line-height:1.7">${esc(body)}</div>` : ''}
</div>
<table style="width:100%;font-size:13px">${rows.map((r) => `<tr><td style="padding:5px 0;color:#64748b;width:110px">${esc(r[0])}</td><td style="color:#1e293b;font-weight:600">${esc(r[1] || '—')}</td></tr>`).join('')}</table>
${action ? `<p style="margin:18px 0 0"><a href="${esc(action.href)}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:700">${esc(action.label)}</a></p>` : ''}
</div>
<div style="padding:10px 22px;background:#f1f5f9;font-size:11px;color:#94a3b8;text-align:center">متابِع — Exceed Advisors</div></div>`;

  const text = [`متابِع — ${label}`, '', title, body ? `\n${body}` : '']
    .concat(rows.map((r) => `${r[0]}: ${r[1] || '—'}`))
    .concat(action ? ['', `${action.label}: ${action.href}`] : [])
    .concat(['', 'متابِع — Exceed Advisors'])
    .join('\n');

  return { html, text };
}

export function queueEmail({ toEmail, toUser = null, event, subject, text, html, issueId = null }) {
  const address = config.mail.redirectAll || toEmail;
  if (!address) return null;
  const id = uid('em');
  getDb().prepare(
    `INSERT INTO emails (id, to_email, to_user, event, subject, body, html, state, attempts, next_try_at, issue_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)`,
  ).run(id, address, toUser, event, subject, text || '', html || '', Date.now(), issueId, Date.now());
  return id;
}

export function suppressEmail({ toEmail, toUser = null, event, subject, reason }) {
  const id = uid('em');
  getDb().prepare(
    `INSERT INTO emails (id, to_email, to_user, event, subject, body, html, state, attempts, error, created_at)
     VALUES (?, ?, ?, ?, ?, '', '', 'suppressed', 0, ?, ?)`,
  ).run(id, toEmail || '', toUser, event, subject, reason, Date.now());
  return id;
}

function markSent(id, info) {
  getDb().prepare(
    `UPDATE emails SET state='sent', attempts = attempts + 1, sent_at = ?, message_id = ?, error = NULL WHERE id = ?`,
  ).run(Date.now(), info?.messageId || null, id);
}

function markFailure(id, attempts, message) {
  const db = getDb();
  const next = attempts + 1;
  if (next >= config.mail.maxAttempts) {
    db.prepare(`UPDATE emails SET state='failed', attempts = ?, error = ?, next_try_at = NULL WHERE id = ?`)
      .run(next, message, id);
  } else {
    db.prepare(`UPDATE emails SET attempts = ?, error = ?, next_try_at = ? WHERE id = ?`)
      .run(next, message, Date.now() + config.mail.retrySeconds * 1000, id);
  }
}

/** Hands every due message to the transport. Safe to call repeatedly. */
export async function flushEmails(limit = 40) {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM emails WHERE state = 'queued' AND (next_try_at IS NULL OR next_try_at <= ?) ORDER BY created_at LIMIT ?`,
  ).all(Date.now(), limit);
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

export function emailLog({ limit = 100, state = null } = {}) {
  const params = [];
  let where = '';
  if (state) { where = 'WHERE state = ?'; params.push(state); }
  params.push(Math.min(Number(limit) || 100, 500));
  return getDb().prepare(`SELECT * FROM emails ${where} ORDER BY created_at DESC LIMIT ?`).all(...params);
}
