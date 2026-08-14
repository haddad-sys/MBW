# متابِع · Mutabea — Installation Guide

Everything needed to get متابِع running, from a laptop trial to a server the
branches actually use. Every command here was run against a clean checkout
before it was written down.

**Contents** · [Requirements](#1-requirements) · [Install](#2-install) ·
[First sign-in](#3-first-sign-in) · [Configuration](#4-configuration) ·
[Turning on email](#5-turning-on-email) · [Installing on a server](#6-installing-on-a-server) ·
[Backups](#7-backups) · [Upgrading](#8-upgrading) · [Recovery](#9-recovery) ·
[Troubleshooting](#10-troubleshooting)

---

## 1. Requirements

| | |
|---|---|
| **Node.js** | 20.11 or newer. Built and tested on 22.x. `node --version` to check. |
| **Disk** | ~150 MB for the application, plus the database. Photographs and documents are stored inside it, so budget by usage — a branch raising 20 notes a month with photographs runs to a few hundred MB a year. |
| **Memory** | 512 MB is comfortable. It is a single Node process with an embedded database. |
| **Network** | One inbound port (3000 by default). Outbound to your SMTP server only if you switch mail on. |
| **Database** | None to install. SQLite is embedded — the whole database is one file. |

There is no separate database server, no Redis, no build step and no CDN. That
is deliberate: the fewer moving parts, the fewer things to keep alive.

> **On Windows** everything below works, but the paths use forward slashes and
> the shell examples assume bash. PowerShell users: use `$env:PORT=3000` instead
> of `PORT=3000`, and Docker Desktop for the container route.

---

## 2. Install

```bash
git clone https://github.com/haddad-sys/MBW.git mutabea
cd mutabea
npm install
npm start
```

`npm install` normally takes a minute or two. Most of it is `better-sqlite3`,
which downloads a prebuilt binary for your platform; if none matches, it compiles
from source and you will need `python3`, `make` and a C++ compiler first
(`apt install python3 make g++` on Debian or Ubuntu, Xcode command line tools on
macOS).

A successful first start prints:

```
متابِع · Mutabea → http://localhost:3000
  البريد    : json — لا يُرسل فعلياً
  التسجيل   : مفتوح — بانتظار اعتمادك
  المحرّك   : كل 300 ثانية
  قاعدة     : /path/to/mutabea/data/mutabea.db
```

Read those four lines — they are the whole configuration at a glance: mail is
composed but not sent, self-registration is open, the background engine runs
every five minutes, and the database is at that path.

Open `http://localhost:3000`. To confirm the server is healthy without a
browser:

```bash
curl -s http://localhost:3000/api/health
```

### Verifying the install

```bash
npm test
```

65 tests, all of which should pass. They run against a throwaway database in
your temporary directory and do not touch your data.

---

## 3. First sign-in

On an **empty** database the first administrator is created automatically:

| | |
|---|---|
| username | `manager` |
| password | `Manager@2026` |

> **This account is created once, and only once.** It appears only when the
> users table is empty. Changing `OWNER_PASSWORD` in `.env` afterwards has no
> effect on an account that already exists — see [Recovery](#9-recovery) if you
> need to change it later and cannot sign in.

Five things to do immediately, in this order:

1. **Change the password.** المزيد → كلمة المرور. Anyone who has read this guide
   knows the default.
2. **Decide about the demo data.** A fresh database arrives with four sample
   branches and seven sample notes so the screens are not empty. Delete them
   from الإعدادات والإدارة → الفروع والتصنيفات, or start over with a genuinely
   empty database — see below.
3. **Create your real branches.** الإعدادات والإدارة → الفروع والتصنيفات → فرع.
   Each arrives with the seven default categories, which you can then edit.
4. **Set the notification recipients.** الإعدادات → الإشعارات. This defaults to
   the owner's email address; add whoever else should be told.
5. **Tell your staff to apply.** They open the same address, choose
   *أنشئ طلب حساب*, and the application lands in your queue at
   الإعدادات والإدارة → طلبات التسجيل. Nobody can sign in until you approve
   them, and the approval is where you set their branch and their permissions.

**Starting with a genuinely empty database.** The demo data is only inserted
when there are no branches, so set this *before the first start*:

```bash
echo "SEED_DEMO=false" >> .env
npm start
```

If you have already started once, `npm run reset` wipes the database and
reseeds it — **destructive, and it takes your accounts with it.** Stop the
server first (see the warning in [Recovery](#9-recovery)).

---

## 4. Configuration

Configuration lives in `.env` beside `package.json`. Copy the annotated sample
and edit it:

```bash
cp .env.example .env
```

Anything already in the environment wins over the file, so a container or a
systemd unit can inject secrets without writing them to disk. The settings that
actually matter:

### Essential

| Setting | Default | What it does |
|---|---|---|
| `PORT` | `3000` | The port to listen on. |
| `JWT_SECRET` | *(random)* | Signs session tokens. **Leave it unset and a new one is generated every start, signing everybody out on every restart.** Set 32+ random bytes: `openssl rand -hex 32`. |
| `APP_URL` | `http://localhost:PORT` | Used to build the "open the note" link inside every email. Set it to the address people actually type. |
| `DB_FILE` | `./data/mutabea.db` | Where the database lives. |
| `SECURE_COOKIES` | on in production | Sends the session cookie only over HTTPS. |

### The first account

| Setting | Default | What it does |
|---|---|---|
| `OWNER_USERNAME` | `manager` | Only read on the very first start. |
| `OWNER_PASSWORD` | `Manager@2026` | Likewise — change it *before* the first start, or change the password in the interface afterwards. |
| `OWNER_EMAIL` | `hani.alhaddad@gmail.com` | Also seeds the default notification recipient list. |
| `SEED_DEMO` | `true` | Four demo branches and seven notes, inserted only when there are no branches. |

### Registration

| Setting | Default | What it does |
|---|---|---|
| `REGISTRATION_OPEN` | `true` | Set `false` to remove the application form entirely; you then create accounts yourself. **Approval is required either way** — this only controls self-service. |
| `ALLOWED_EMAIL_DOMAINS` | *(empty)* | Comma-separated allow-list, e.g. `exceedadvisors.com`. Empty means anyone may apply. |

### Engine and uploads

| Setting | Default | What it does |
|---|---|---|
| `SCHEDULER_ENABLED` | `true` | The background engine: due-soon and overdue detection, and the mail flush. |
| `TICK_SECONDS` | `300` | How often it runs. |
| `DUE_SOON_DAYS` | `1` | How many days ahead counts as "due soon". |
| `MAX_UPLOAD_BYTES` | `3145728` (3 MB) | Per photograph or document, measured on the server. |
| `JSON_LIMIT` | `12mb` | The whole request body. Must exceed `MAX_UPLOAD_BYTES` with room for a batch. |

Mail settings are in the next section.

---

## 5. Turning on email

Out of the box `MAIL_TRANSPORT=json`: every message is composed, queued and
logged, but nothing is sent. You can read exactly what *would* have gone out
under **الإعدادات → سجل البريد**. Nothing is lost by leaving it this way, and
switching it on later flushes the backlog.

### Gmail

Google will not accept your ordinary password. You need an **app password**,
which requires 2-Step Verification on the account:

1. Turn on 2-Step Verification at <https://myaccount.google.com/security>.
2. Go to <https://myaccount.google.com/apppasswords>.
3. Create one named "Mutabea". Google shows a 16-character password once.
4. Put it in `.env` — spaces removed:

```ini
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your.address@gmail.com
SMTP_PASS=abcdefghijklmnop
MAIL_FROM=متابِع <your.address@gmail.com>
```

`MAIL_FROM` must be the same address as `SMTP_USER`, or Gmail rewrites it.

### Any other SMTP server

Same block, with your host. Use `SMTP_PORT=465` with `SMTP_SECURE=true` for
implicit TLS, or `587` with `SMTP_SECURE=false` for STARTTLS.

### Confirming it works

Restart, then, signed in as an administrator:

1. **الإعدادات → سجل البريد** shows the transport in use at the top. It should
   now say `smtp`, not `json`.
2. Press **فحص الاتصال**. Success reports the transport in use. A failure shows
   the reason verbatim — `getaddrinfo ENOTFOUND` is a wrong hostname,
   `Invalid login` a wrong username or app password.
3. **الإعدادات → الإشعارات → إرسال إشعار تجريبي** sends one real message to
   you, rings the bell and plays the chime. If it arrives, the whole path works.

Queued mail is sent by the background engine on its next tick, or immediately
with **إرسال المعلّق** in the mail log. Failures are retried up to
`MAIL_MAX_ATTEMPTS` times and then marked `failed` with the error against them —
the log always distinguishes a message that never arrived from one that was
never raised.

> **On a staging copy of live data, set `MAIL_REDIRECT_ALL=you@example.com`.**
> Every recipient is rewritten to that one address, so a test copy cannot mail
> your real branch staff.

---

## 6. Installing on a server

### Route A — Docker

```bash
git clone https://github.com/haddad-sys/MBW.git mutabea && cd mutabea
cp .env.example .env
# Set JWT_SECRET and OWNER_PASSWORD — compose refuses to start without them.
nano .env
docker compose up -d --build
```

One service, one volume. The database lives in the `mutabea-data` volume; the
container runs as a non-root user and health-checks itself on `/api/health`.

```bash
docker compose logs -f          # watch it
docker compose down             # stop, keeping the volume
docker compose up -d --build    # after pulling changes
```

> The Docker route is written and validated but has not been built end-to-end
> on a live daemon, so allow for one round of iteration on the first build.

### Route B — systemd and nginx

Assuming Debian or Ubuntu, the application at `/opt/mutabea`, running as its own
unprivileged user:

```bash
sudo adduser --system --group --home /opt/mutabea mutabea
sudo -u mutabea git clone https://github.com/haddad-sys/MBW.git /opt/mutabea
cd /opt/mutabea
sudo -u mutabea npm ci --omit=dev
sudo -u mutabea cp .env.example .env
sudo -u mutabea nano .env        # JWT_SECRET, APP_URL, OWNER_PASSWORD, SMTP
```

`/etc/systemd/system/mutabea.service`:

```ini
[Unit]
Description=Mutabea
After=network.target

[Service]
Type=simple
User=mutabea
Group=mutabea
WorkingDirectory=/opt/mutabea
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/mutabea/data

[Install]
WantedBy=multi-user.target
```

> Deliberately no `EnvironmentFile=`. The application reads `.env` itself, and
> systemd's parser handles quoting differently — letting one of them do it
> avoids a class of confusing bugs.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mutabea
sudo systemctl status mutabea
```

nginx, at `/etc/nginx/sites-available/mutabea`:

```nginx
server {
    server_name mutabea.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # The live notification channel is a long-lived response. Without
        # these three lines notifications arrive in batches, late, or not at
        # all — the single most common deployment mistake.
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 3600s;

        # Must exceed JSON_LIMIT, or photograph uploads fail at the proxy
        # before they ever reach the application.
        client_max_body_size 16m;
    }
}
```

Then TLS, which also sets `SECURE_COOKIES` sensibly for you:

```bash
sudo ln -s /etc/nginx/sites-available/mutabea /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mutabea.example.com
```

Finally set `APP_URL=https://mutabea.example.com` in `.env` and
`sudo systemctl restart mutabea`, so email links point at the real address.

### Production checklist

- [ ] `JWT_SECRET` set to 32+ random bytes
- [ ] `OWNER_PASSWORD` changed, and the password changed again in the interface
- [ ] `SEED_DEMO=false` **before the first start**
- [ ] `APP_URL` is the address people actually type
- [ ] `NODE_ENV=production`
- [ ] TLS terminated, `SECURE_COOKIES=true`
- [ ] SMTP configured and the test notification received
- [ ] Backups scheduled (next section)
- [ ] `/api/health` returns `ok: true` from outside the machine

---

## 7. Backups

The database is one file. That file is the entire system — accounts, notes,
photographs, documents, the mail log. Nothing else on the machine is
irreplaceable.

```bash
npm run backup
```

Writes `data/backups/mutabea-YYYY-MM-DD-HHMM.db`, using SQLite's own backup
mechanism, **safely while the server is running** — a write landing mid-backup
cannot produce a torn file. It reads the copy back and reports what it contains
before claiming success. Give it a path to put it elsewhere:

```bash
npm run backup -- /mnt/backups/mutabea.db
```

Nightly at 02:00, keeping 30 days:

```cron
0 2 * * * cd /opt/mutabea && /usr/bin/npm run backup >> /var/log/mutabea-backup.log 2>&1
30 2 * * * find /opt/mutabea/data/backups -name '*.db' -mtime +30 -delete
```

Under Docker:

```bash
docker compose exec mutabea npm run backup -- /data/backups/mutabea.db
docker compose cp mutabea:/data/backups/mutabea.db ./mutabea-backup.db
```

**Restoring** is the reverse, and the server must be stopped:

```bash
sudo systemctl stop mutabea
sudo -u mutabea cp /mnt/backups/mutabea.db /opt/mutabea/data/mutabea.db
sudo -u mutabea rm -f /opt/mutabea/data/mutabea.db-wal /opt/mutabea/data/mutabea.db-shm
sudo systemctl start mutabea
```

Test a restore at least once, onto a spare machine, before you need it.

---

## 8. Upgrading

```bash
cd /opt/mutabea
npm run backup                  # always first
sudo systemctl stop mutabea
sudo -u mutabea git pull
sudo -u mutabea npm ci --omit=dev
sudo -u mutabea npm test        # optional but cheap
sudo systemctl start mutabea
```

The schema is created with `IF NOT EXISTS` and applied at every start, so new
tables and indexes appear on their own. Your data is not migrated or rewritten.

---

## 9. Recovery

> **Stop the server before touching the database file.** A running server holds
> an open handle; replace the file underneath it and it carries on reading the
> old, deleted one — changes appear to vanish and sign-ins fail for no visible
> reason. This surprises people, so it is worth repeating.

### Nobody can sign in as an administrator

Resets the password and reactivates the account:

```bash
sudo systemctl stop mutabea     # or Ctrl-C, or: docker compose stop
cd /opt/mutabea
node -e "
const { getDb } = await import('./src/db/index.js');
const { hashPassword } = await import('./src/lib/auth.js');
getDb().prepare('UPDATE users SET password_hash = ?, status = ? WHERE username = ?')
  .run(hashPassword('NewPassword@2026'), 'active', 'manager');
console.log('done');
" --input-type=module
sudo systemctl start mutabea
```

Change the password again in the interface afterwards, since it has now been
typed into a shell history.

### An approval was a mistake

Nothing is permanent. الإعدادات والإدارة → المستخدمون والصلاحيات lets you change
anyone's branch and permissions, suspend the account (`موقوف` — the session dies
at the next request), or delete it. The system refuses to leave itself without a
working administrator, so the last such account cannot be demoted, suspended or
deleted.

### Starting completely over

```bash
npm run reset
```

Deletes the database and reseeds it. **Every account, note, photograph and
document goes.** Take a backup first.

---

## 10. Troubleshooting

**`Error: listen EADDRINUSE: address already in use 0.0.0.0:3000`**
Something already holds the port — very often an earlier copy of this server.
`lsof -i :3000` to find it, or set a different `PORT`.

**`npm install` fails compiling better-sqlite3**
No prebuilt binary matched your platform, so it tried to compile.
`sudo apt install python3 make g++` and try again. On Alpine you also need
`build-base`.

**Everybody is signed out after every restart**
`JWT_SECRET` is unset, so a new signing key is generated each start and all
existing tokens become invalid. Set it.

**Notifications arrive late, in batches, or never — but a page refresh shows them**
The live channel is being buffered by a proxy. The application sends
`X-Accel-Buffering: no`, which nginx honours, but `proxy_buffering off` and
`proxy_read_timeout 3600s` are still needed, along with `proxy_http_version 1.1`
and an empty `Connection` header. See the nginx block above. Confirm the channel
is up: the browser console `window.ST.S.live` should be `true`.

**The bell shows but no sound plays**
Browsers refuse to play audio until the person has interacted with the page.
The first tap on the bell or the add button unlocks it. Also check the mute
setting in المزيد — it is remembered per device. On iOS the silent switch
silences it regardless.

**A photograph upload fails**
Over `MAX_UPLOAD_BYTES` (3 MB by default), measured on the server after the
browser's own compression. A `413` from nginx rather than the application means
`client_max_body_size` is too low.

**Somebody cannot sign in and sees "حسابك بانتظار اعتماد المسؤول"**
Working as designed — their application is in your queue at
الإعدادات والإدارة → طلبات التسجيل. If the queue is empty, they never applied,
or they were rejected.

**A branch account cannot see records you know exist**
Also by design. Their `scope` is `own`, so they see only their own branch, and
anything else answers "not found" rather than "forbidden". Change their branch
or widen the scope in المستخدمون والصلاحيات.

**The interface renders left-to-right**
The stylesheet failed to load — check that `/app.css` returns 200. The page
sets its own direction before first paint, so this is always a static-file
problem, not a browser one.

**Mail sits at `queued` forever**
The engine is off (`SCHEDULER_ENABLED=false`) or `MAIL_TRANSPORT` is still
`json`. Press **إرسال المعلّق** in the mail log to force an attempt and read the
error it records.

### Where to look

| | |
|---|---|
| Is the server alive and how is it configured? | `GET /api/health` |
| What did it print? | `journalctl -u mutabea -f`, or `docker compose logs -f` |
| Did that email go? | الإعدادات → سجل البريد |
| Who did what, and when? | الإعدادات → سجل الحركة |
| Is the live channel connected? | `window.ST.S.live` in the browser console |

**The activity trail.** Every sign-in, approval, rejection, account change and
configuration change is recorded, and <span dir="rtl">سجل الحركة</span> shows it
grouped by day, filtered by family, and searchable by name or detail. It is
append-only: nothing in the application updates or deletes an entry, and there
is no route that would.

It is on the API too, if you want to pull it into something else. Paging is by
cursor — pass back the `at` **and** the `id` of the last entry you were given,
since several entries commonly share a millisecond:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"manager","password":"YOUR_PASSWORD"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

curl -s -H "authorization: Bearer $TOKEN" \
  'http://localhost:3000/api/admin/audit?limit=50&family=user'
```

---

*متابِع · Mutabea — Exceed Advisors*
