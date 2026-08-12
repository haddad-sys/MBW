# متابع · Mutabi

A task **follow-up** console: work is raised, assigned, followed, chased and
escalated — and everybody attached to a task is told what happened, in the
browser and by email.

It is the متابعة / المتابعون idea from the Mihwar artifact built for real: the
artifact modelled email delivery and had no server, so nothing actually left the
page. Here the notification path is genuine — a real SMTP hand-off, a real
live channel, a real background engine.

- **Arabic-first, bilingual.** Full RTL, with English as a peer. Every task, name
  and status carries both languages, and each message is rendered in the
  *reader's* language, not the sender's.
- **Notifications that reach people.** A bell with a live badge, an audible ring,
  a toast, an optional desktop popup, and transactional email — all raised from
  one choke point so a preference cannot be honoured on one surface and ignored
  on another.
- **A background engine.** Reminders, overdue detection and escalation to the
  line manager, each idempotent so a restart cannot double-notify.

---

## Running it

```bash
npm install
npm run seed        # creates the demo organisation
npm start           # http://localhost:3000
```

Sign in with any seeded account — the password is `Mutabi#2026`:

| Account | Role | Sees |
| --- | --- | --- |
| `admin@mutabi.local` | Administrator | everything, plus the email log and user management |
| `layla@mutabi.local` | Manager | her department, her team and her direct reports |
| `khalid@mutabi.local` | Manager | engineering |
| `sara@mutabi.local` | Member | her own work and her team's |
| `huda@mutabi.local` | Member | compliance work |
| `faris@mutabi.local` | Viewer | reads, never writes |

```bash
npm test            # 94 tests: API, permissions, notifications, mail, scheduler, live channel
npm run dev         # watch mode
npm run reset       # drop the database and reseed
```

---

## The two things you asked for

### 1. Email notifications

Out of the box `MAIL_TRANSPORT=json`: every message is fully rendered — subject,
plain text, bilingual HTML, the deep link back to the task — and written to the
email log with a delivery state, but nothing leaves the process. That makes the
whole path testable without a mail server.

To send for real, put a server in `.env`:

```bash
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=•••
MAIL_FROM=Mutabi <no-reply@your-domain.com>
APP_URL=https://mutabi.your-domain.com
```

Nothing else changes. **Administration → Email log** shows every message with its
state (`queued` · `sent` · `failed` · `suppressed`), the failure reason when
there is one, and a **Verify connection** button that tests SMTP without sending.

Delivery is queue-then-send, not send-inline: a message is written to the log
first, so a mail server that is down delays a notification instead of losing it,
or failing the action that raised it. Failures retry up to `MAIL_MAX_ATTEMPTS`
and then rest in the log as `failed` — visible, never silent.

On staging, set `MAIL_REDIRECT_ALL=you@example.com` and every recipient is
rewritten, so a copy of production data cannot mail real people.

### 2. Ringing on the website

The browser holds an open [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
connection to `/api/stream`. When a notification is raised for you, five things
happen at once:

| Surface | Behaviour |
| --- | --- |
| **Badge** | the bell count updates immediately, and the tab title becomes `(3) متابع` |
| **Ring** | a chime, synthesised with the Web Audio API — no asset to load, and the tone changes with severity: two rising notes normally, three insistent ones for overdue and escalations, one soft note for routine updates |
| **Shake** | the bell icon rings visually, which is the whole cue for anyone who muted the sound |
| **Toast** | a card slides in, colour-coded by severity, and clicking it opens the task |
| **Desktop** | an OS notification, if the person granted permission |

Browsers refuse to play audio until the person has interacted with the page, so
the audio context is unlocked on the sign-in click and on any later gesture. If
it is still blocked, the notification arrives silently rather than throwing —
**Settings → In-app notifications → Enable sound** plays a test chime on demand.

**Settings → Send a test notification** puts a real notification through the real
path — bell, ring, toast and email — so "is this actually wired up?" has a
one-click answer. Being a diagnostic, it is treated as mandatory: it ignores
quiet hours and a muted email setting, so it always demonstrates the full path.

---

## How a notification is decided

Every notification in the system goes through one function, `notify()` in
`src/services/notify.js`. Nothing else writes to the notifications table and
nothing else queues mail — which is what makes a preference honest, because
there is exactly one place where it can be consulted.

```
notify({ userId, kind, taskId, actorId, text, textAr })
  │
  ├─ the actor is not told about their own action
  │
  ├─ in-app?  enabled AND this event is not muted
  │             └─ record it, push it live, and ring
  │                unless quiet hours are open (recorded, but silent)
  │
  └─ email?   mode is not "off", the event is not muted,
              and — in "critical only" mode — the task is Critical
                └─ queue it, held until quiet hours close
                otherwise: log it as suppressed, with the reason
```

**Escalations and approvals ignore all of it.** They ring inside quiet hours and
they email even when email is switched off, because the point of an escalation
is that somebody stopped reading their notifications.

Quiet hours **hold** email rather than dropping it: the message waits in the
queue with a release time and goes out when the window closes.

### Who gets told

The audience of a task is its assignee, its accountable owner, its participants
and its **المتابعون — followers**. Following is the core gesture: it lets somebody
track work they are not doing without being made responsible for it, and it is
what a "follow-up console" is for. Creating a task follows it; being assigned one
follows it; being mentioned in a comment follows it.

| Event | Kind | Who |
| --- | --- | --- |
| Assigned to you | `assign` | the new assignee |
| Taken off you | `reassign` | the previous assignee |
| Status moved | `status` / `complete` | everybody following |
| Deadline moved | `due` | everybody following |
| Comment | `comment` | everybody following |
| `@mentioned` | `mention` | the mentioned person (outranks the comment sweep) |
| Added as a follower | `watch` | the person added — choosing to follow yourself is silent |
| Reminder fires | `reminder` | the target, or everybody following |
| Deadline passed | `overdue` | everybody following, once |
| Still overdue | `escalation` | the assignee's line manager, once |

---

## The background engine

A tick every `TICK_SECONDS` (default 60), also runnable on demand from
**Email log → Run engine**:

1. **Reminders** — fires anything due. An automatic reminder mirrors the due date
   (`REMINDER_LEAD_DAYS` before it) and is regenerated whenever the deadline
   moves, so a rescheduled task never leaves a stale alarm behind.
2. **Overdue** — announces tasks that have just passed their deadline and flags
   them, so a task goes overdue *once*, not once per minute.
3. **Escalation** — after `ESCALATION_DAYS` overdue, escalates to the assignee's
   manager, falling back to the owner's manager and then to an administrator, so
   an escalation never lands nowhere.
4. **Mail** — hands the queue to the transport and records what happened.

Rescheduling a task clears its overdue and escalation stamps, so it can announce
itself again on the new date.

---

## Access

Four roles across twenty-four permissions (`src/lib/permissions.js`), transcribed
from the artifact's matrix. Two questions are kept apart:

- `can(user, permission)` — what may this *kind* of person do at all?
- `taskAccess(user, task)` — which rows *exist* for them, and may they change
  this one? Returns `none` · `view` · `edit`.

Every read and every write goes through `taskAccess()`, so a surface cannot
invent its own rule. A record out of reach answers **404, not 403** — its
existence is itself privileged. Personal attachment always wins: work you are
assigned, own, created or follow stays reachable however narrow your role.

**Overdue and due-soon are never stored.** They are derived on read from the
deadline and the closure state, so a task cannot be simultaneously "Completed"
and "Overdue", and no batch job is needed to keep a flag honest.

---

## Layout

```
src/
  config.js              environment and defaults
  app.js  server.js      express wiring, boot, graceful shutdown
  db/       schema.sql · connection · seed
  lib/      auth · permissions · prefs · time · ids
  services/
    notify.js            THE choke point — every notification passes here
    realtime.js          the SSE hub
    mailer.js            queue, transport, retry, log
    templates.js         bilingual subject/text/HTML
    scheduler.js         reminders · overdue · escalation · mail flush
    tasks.js             task rules, followers, comments, checklist
    audit.js             append-only history
  routes/   auth · tasks · notifications · stream · meta · admin
public/
  index.html  app.css
  js/  app.js · views.js · notifications.js · ring.js · live.js · api.js · i18n.js · dom.js
test/       94 tests
```

No build step and no front-end framework: the browser loads ES modules directly.
The UI is built through one `el()` helper that only ever sets `textContent`, so
task titles and comments cannot become markup.

### API

| | |
| --- | --- |
| `POST /api/auth/login` · `/logout` · `GET /me` | session |
| `PUT /api/auth/me/prefs` · `/profile` · `POST /me/password` | own account |
| `GET/POST /api/tasks` · `GET/PATCH/DELETE /api/tasks/:id` | tasks |
| `GET/POST /api/tasks/:id/watchers` · `DELETE .../:user` | المتابعون |
| `POST /api/tasks/:id/comments` · `/checklist` · `/reminders` | task detail |
| `GET /api/tasks/:id/history` | audit trail |
| `GET /api/notifications` · `/count` · `POST /read` · `/read-all` · `/test` | notifications |
| `GET /api/stream` | the live channel (SSE) |
| `GET /api/admin/emails` · `/mail/verify` · `POST /mail/flush` · `/tick` | operations |
| `GET /api/admin/users` · `POST` · `PATCH /:id` | people |

---

## Deploying

1. Set `JWT_SECRET`, `NODE_ENV=production`, `APP_URL`, and the SMTP block.
2. Put a TLS terminator in front and leave `SECURE_COOKIES=true` — and disable
   response buffering for `/api/stream`, or the live channel will stall
   (`proxy_buffering off;` in nginx; the app already sends `X-Accel-Buffering: no`).
3. Run one process. The SSE hub and the scheduler are in-process, so a multi-node
   deployment needs a shared bus (Redis pub/sub) and a single scheduler owner
   before it will behave.
4. `data/` holds the SQLite database in WAL mode — back it up, or move the
   storage adapter to Postgres, which is the only layer that has to change.
