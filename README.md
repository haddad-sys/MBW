# متابِع · Mutabea

نظام متابعة المهام والملاحظات للفروع — a mobile-first, Arabic, right-to-left
console for following work across branches: notes are raised against a branch
and a category, moved through a workflow with an approval gate, and everybody
who should know is told — in the app, live, and by email.

This is the متابِع artifact built as a real application. The artifact kept
everything in the browser's storage; here the data lives on a server, accounts
are applied for and approved, and the notifications genuinely leave the process.

- **Registration with an approval gate.** Anyone can apply. Nobody gets in until
  an administrator approves them — and the approval is where their branch,
  their role and their exact permissions are decided.
- **Notifications on both surfaces.** A live badge, an audible chime and a toast
  over Server-Sent Events, plus transactional email — both raised from a single
  choke point, so a preference cannot be honoured in the app and ignored in the
  mail.
- **Row-level scope, enforced on the server.** A branch account cannot read,
  edit or delete anything outside its branch, and a record it cannot reach
  answers 404 rather than 403 — existence itself is not disclosed.
- **A configurable workflow.** Statuses, priorities, types and categories are
  data. A status may be a *gate*: passing it requires the approval permission.

---

## Running it

```bash
npm install
cp .env.example .env      # optional; the defaults work for a local run
npm start                 # http://localhost:3000
```

On an empty database the server creates the first administrator and prints where
it is listening. Sign in, then change the password from **المزيد → كلمة المرور**.

| | |
|---|---|
| username | `manager` |
| password | `Manager@2026` |

Set `SEED_DEMO=false` before the first boot for an empty database with no demo
branches.

```bash
npm run dev      # the same, with a watcher
npm test         # 65 tests: the API, the approval gate, notifications, mail
npm run reset    # drop the database and seed it again
```

There is also an end-to-end pass through a real browser — apply, be refused, be
approved, sign in, raise a note, watch the administrator's badge advance. It
needs Playwright, which is deliberately not a dependency:

```bash
npm install --no-save playwright && npx playwright install chromium
PORT=4173 npm start &
node test/browser/pass.mjs
```

Node 20.11 or newer. The only runtime dependencies are Express, better-sqlite3,
bcryptjs, jsonwebtoken, cookie-parser and nodemailer.

---

## How an account comes to exist

1. Somebody opens the sign-in card and chooses **أنشئ طلب حساب**. They give a
   name, a username, an email address, a password and — optionally — the branch
   they belong to and a note for the administrator.
2. The application is stored with `status = 'pending'`. It can do nothing: the
   session middleware attaches a user only when the status is `active`, so even
   a forged token is inert. Signing in returns `403 account_pending`.
3. Every administrator gets a notification and an email. The count also appears
   as a badge on **المزيد**.
4. The administrator opens **الإعدادات والإدارة → طلبات التسجيل** and either
   approves — choosing the branch, the preset and any individual permission — or
   rejects with a reason.
5. The applicant is emailed the decision at the address they applied with. On
   approval they can sign in; on rejection the sign-in says so, with the reason.

Registration answers `202` with the same body whether or not the address is
already known, so the form cannot be used to enumerate accounts.

Two switches govern the door: `REGISTRATION_OPEN` closes self-service
entirely, and `ALLOWED_EMAIL_DOMAINS` limits who may apply. Neither removes the
approval step.

---

## Notifications

Everything goes through `raise()` in `src/services/notify.js` — the single place
that writes a notification row or queues a message. Nothing else in the codebase
may write to `notifications` or `emails`.

For each event it:

1. checks the master switch and the per-event switch,
2. writes an in-app notification for every person in the audience,
3. pushes it down their open Server-Sent Events channels — badge and all,
4. queues an email for the configured recipients, plus any address the caller
   adds (an applicant's own address, for instance, which has no account yet).

The person who caused the event is not told about their own action unless the
caller passes `force` — an approval decision is sent to the applicant regardless.

**In the browser.** One `EventSource` per tab, authenticated by the session
token, reconnecting with exponential backoff. An arriving notification bumps the
badge, animates the bell, plays a two-note chime — three insistent notes when the
event is urgent — and shows a toast. The chime is synthesised with the Web Audio
API, needs no asset, and is muted per-device from **المزيد**. Browsers require a
gesture before audio may play; the first tap on the bell or the add button
unlocks it.

**By email.** Messages are queued to the database first and sent by the
background engine, with retries and a per-message attempt count. The full log —
sent, queued, failed and suppressed — is readable at **الإعدادات → سجل البريد**,
so a message that never arrived can be told apart from one that was never
raised. `MAIL_TRANSPORT=json` renders and logs without sending, which is the
default and what the tests use.

Events: a note added, edited, moved, awaiting approval, approved or closed, due
soon, overdue, a comment, a photograph, a document, a new application, an
approved account. Each can be switched off individually.

---

## Permissions

Three presets — manager, branch, read-only — are a starting point, not a
straitjacket. Any account can be given any combination of fourteen permissions
and four visible tabs, and every one of them is checked on the server:

`create · edit · changeStatus · approve · del · comment · photos · uploadDocs ·
deleteDocs · manageEntities · manageTeam · manageUsers · settings · export`

Uploads are held to `MAX_UPLOAD_BYTES`, measured on the server from the payload
itself — a client's declared file size is never taken on trust, and the browser's
compression is a convenience, not the control.

`scope` is the important one. `all` reaches every branch; `own` exists only
inside the account's own branch, and that filter is applied in the query, not in
the interface. A stored permission set overrides the role for the keys it names;
an unreadable one falls back to the branch preset rather than escalating.

The system refuses to be left without an administrator: the last account that
can manage users cannot be demoted, disabled or deleted.

---

## Layout

```
src/
  app.js          the Express application
  server.js       boot: seed the owner, start the scheduler, listen
  config.js       environment and defaults
  db/             schema.sql, the connection, the seed
  lib/
    domain.js     presets, permissions, workflow defaults, event catalogue
    auth.js       hashing, tokens, the middleware that gates on status
  routes/
    auth.js       register · login · logout · me · password
    api.js        bootstrap · issues · entities · library · notifications · export
    admin.js      registrations · users · variables · team · mail · engine · audit
    stream.js     the Server-Sent Events channel
  services/
    notify.js     raise() — the one place notifications come from
    mailer.js     transport, the RTL template, the queue and the log
    issues.js     the domain: scope, the gate, recurrence, sub-resources
    scheduler.js  due-soon, overdue, mail flush
    realtime.js   who is connected, and writing to them
public/
  index.html      the shell
  app.css         a generated Tailwind subset — no CDN, no build step at runtime
  js/
    core.js       formatting, the API client, the chime, the live channel
    ui.js         the element helper, the icon set, the charts
    state.js      the snapshot and how it refreshes
    auth-views.js sign in and apply
    views.js      dashboard, tasks, branches
    views2.js     the record, the form, library, reports, alerts, more
    admin-views.js registrations, users, branches, variables, team, mail
    app.js        the router, the boot sequence, the live wiring
test/             65 tests over the running server, plus an optional
                  browser pass through the whole journey (test/browser)
Dockerfile        a two-stage build; docker-compose.yml adds the volume
artifact/         the published artifact this application was built from
```

There is no front-end build step and no runtime CDN: the stylesheet is a
generated subset of Tailwind, the icons are inline SVG, and the charts are drawn
by hand. The page is stamped `dir="rtl"` before first paint.

---

## Deploying

```bash
cp .env.example .env        # set JWT_SECRET and OWNER_PASSWORD — compose refuses to start without them
docker compose up -d --build
```

One service, one volume. The database is a single SQLite file living in
`mutabea-data`; back up that one path and everything else can be rebuilt from
the image. The container runs as a non-root user and answers a health check on
`/api/health`.

Running it directly instead is the same thing without the wrapper — the database
is still one file, so put it on persistent storage. For anything public:

```
NODE_ENV=production
JWT_SECRET=<32+ random bytes>       # without it, sessions die on restart
SECURE_COOKIES=true                 # terminate TLS in front of the process
APP_URL=https://mutabea.example.com # the links inside every email
SEED_DEMO=false
OWNER_PASSWORD=<something else>
SMTP_HOST=…  SMTP_USER=…  SMTP_PASS=…
```

Behind a reverse proxy, the live channel needs buffering off — the server sends
`X-Accel-Buffering: no`, which nginx honours; for anything else, disable
response buffering on `/api/stream` and allow long-lived connections.

`MAIL_REDIRECT_ALL` rewrites every recipient to one address: set it on any
staging copy of production data so it cannot mail real people.

`GET /api/health` reports the environment, the mail transport, whether
registration is open and whether the engine is running.
