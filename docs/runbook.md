# Runbook: the TaskMint server stack

How to run, back up, recover and lock down the compose stack. For setting it
up, see the README's "Run the stack". The commands run from the repository
root. They use `psql` inside the `db` container, so they need nothing
installed on the host.

```bash
alias tmsql='docker compose exec -T db psql -U taskmint -d taskmint -v ON_ERROR_STOP=1'
```

## Health

```bash
docker compose ps                        # each service's health
curl -s http://localhost:8080/healthz    # nginx answers
docker compose exec server taskmint-server healthcheck && echo server ok
docker compose logs --since 1h server    # JSON lines (LOG_FORMAT=text for plain)
docker compose logs --since 1h web       # nginx access log (link secrets redacted)
```

- The server's `/readyz` answers 503 when it can't reach the database. The
  image's health check runs `healthcheck`, which only asks `/healthz`.
- Container logs rotate at 3 × 10 MB per service.
- `RUST_LOG=debug` in `.env` (then `docker compose up -d`) adds a span per
  request. It names the route, never the path, so link secrets stay out.

## Backups

Everything is in Postgres: accounts, every account's data, the server's own
copies (`data_snapshots`) and the audit log. Back it up with `pg_dump`, and
keep copies somewhere other than this machine. `backups/` is ignored by git,
since its files hold every account's data.

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U taskmint -Fc taskmint > "backups/taskmint-$(date +%Y%m%d-%H%M).dump"
```

**Daily, with cron** (`crontab -e`; adjust the path; `%` must be escaped in
crontab):

```cron
15 3 * * * cd /path/to/taskmint-app && docker compose exec -T db pg_dump -U taskmint -Fc taskmint > backups/taskmint-$(date +\%Y\%m\%d).dump && find backups -name 'taskmint-*.dump' -mtime +30 -delete
```

**Check that a backup restores** into a throwaway Postgres, without touching
the stack. Run it now and then:

```bash
docker run -d --name tm-restore-check -e POSTGRES_PASSWORD=check postgres:18-alpine
sleep 5
docker exec -i tm-restore-check pg_restore -U postgres -d postgres --no-owner < backups/<file>.dump
docker exec tm-restore-check psql -U postgres -c 'SELECT count(*) AS users FROM users' -c 'SELECT count(*) AS sessions FROM sessions'
docker rm -f tm-restore-check
```

**Restore the stack from a backup.** Every account goes back to the time of
the dump.

```bash
docker compose stop server web
docker compose exec -T db pg_restore -U taskmint -d taskmint --clean --if-exists --no-owner < backups/<file>.dump
docker compose up -d --wait
```

Open tabs and desktop apps reconnect by themselves. Anything made after the
dump is gone: sessions, links and tokens included.

**One account's data.** The server has no per-account restore. Two options:
- The user re-imports a backup file they exported (Settings → Data
  Management → Import). This adds what's missing; nothing present is replaced.
- An operator restores the whole database, as above.

Before a risky command (an import that rewrites days, a restore, a reset),
the server keeps a copy of the account's affected data: the newest 10 of each
kind (`sessions`, `work_logs`, `records`, `incoming_records`). They're for
inspection and hand repair:

```bash
tmsql -c "SELECT s.id, s.kind, s.reason, s.created_at FROM data_snapshots s JOIN users u ON u.id = s.user_id WHERE u.username = 'alice' ORDER BY s.id DESC"
tmsql -At -c "SELECT data FROM data_snapshots WHERE id = 123" > backups/snapshot-123.json
```

## Upgrading

Migrations run before the server starts (the `migrate` service), and they're
forward-only: an older server image can't run on a newer schema.

```bash
docker compose exec -T db pg_dump -U taskmint -Fc taskmint > backups/before-upgrade.dump
git pull
docker compose up --build -d --wait
node scripts/smoke.mjs    # optional; leaves one disabled smoke-… user behind
```

**Going back** to the previous version means its code and the database from
before the upgrade. Check out the previous commit, restore
`before-upgrade.dump` as above, then run `docker compose up --build -d --wait`.

## Accounts

Admins do most of this in the web app: Settings → Users and Settings →
Invites. The command line and SQL below are for when nobody can sign in as an
admin, or for an incident.

**Links from the command line.** Each prints a one-time URL; pass it on.
Invites last `TASKMINT_INVITE_TTL_HOURS`, reset links
`TASKMINT_RESET_TTL_HOURS`.

```bash
docker compose exec server taskmint-server admin create-invite --role admin --note "recovery"
docker compose exec server taskmint-server admin reset-password <username>
```

- **No admin can sign in:** create an admin invite, accept it in a private
  window, then fix the old accounts from Settings → Users.
- **A forgotten password:** a reset link. Accepting it signs the user out
  everywhere, browsers and desktop apps alike. Tokens made on the tokens page
  keep working.
- **The last admin** can't be disabled or demoted, from the web app or the
  API. Make another admin first.

**Who did what:**

```bash
tmsql -c "SELECT a.at, actor.username AS actor, a.action, target.username AS target, a.detail, a.ip
          FROM audit_events a
          LEFT JOIN users actor ON actor.id = a.actor_id
          LEFT JOIN users target ON target.id = a.target_user_id
          ORDER BY a.id DESC LIMIT 50"
```

Actions: `user.bootstrap`, `user.update`, `invite.create`, `invite.accept`,
`invite.revoke`, `password_reset.create`, `password_reset.accept`,
`password.change`, `token.create` and `token.revoke`. Sign-ins aren't audited.

## Incidents

**An account may be compromised.**
1. Disable it: Settings → Users → Disable. That ends its sessions, revokes
   every token and closes its event streams at once.
2. Read its audit trail (above) and its tokens:
   `tmsql -c "SELECT name, kind, scope, created_at, last_used_at, revoked_at FROM api_tokens WHERE user_id = (SELECT id FROM users WHERE username = 'alice') ORDER BY created_at"`.
3. Enable it again, and give the owner a reset link. They make new tokens for
   the extension or scripts; the desktop signs in again.

**Without a working admin session**, the same in SQL. Lookups refuse a
disabled user at once; restarting the server closes the streams already open:

```bash
tmsql -c "UPDATE users SET disabled_at = now() WHERE username = 'alice'"
tmsql -c "UPDATE api_tokens SET revoked_at = now() WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE username = 'alice')"
docker compose restart server
```

**A link was sent to the wrong person.** For an invite, revoke it in Settings
→ Invites. For a reset link, issue a new one: that expires the old.

**Sign everyone out** (say, after the database or a backup leaked). Browser
sessions and every token end. Users sign in again and make new tokens; people
with no admin need a reset link.

```bash
tmsql -c "DELETE FROM auth_sessions"
tmsql -c "UPDATE api_tokens SET revoked_at = now() WHERE revoked_at IS NULL"
docker compose restart server
```

Stored passwords are argon2id hashes. After a leak, still have everyone
change theirs.

**Rotate the database password.** Use hex, so it needs no escaping in
`DATABASE_URL`:

```bash
NEW=$(openssl rand -hex 24)
tmsql -c "ALTER ROLE taskmint PASSWORD '$NEW'"
# set POSTGRES_PASSWORD=$NEW in .env, then:
docker compose up -d --wait
```

`POSTGRES_PASSWORD` only takes effect when the volume is first created, so
the `ALTER ROLE` is what changes the password. `.env` then hands it to
`migrate` and `server`.

**The admin password from `.env`** (`ADMIN_PASSWORD`) is used only when the
server starts with no users. Change it in Settings → Account; editing `.env`
later does nothing.

## Housekeeping

Used-up and expired rows stay, for the audit trail. They're small, but to
prune them:

```bash
tmsql -c "DELETE FROM auth_sessions WHERE expires_at < now()"
tmsql -c "DELETE FROM password_resets WHERE expires_at < now() - interval '30 days'"
```

Disk: `docker system df` shows images, volumes and the build cache.
`docker builder prune` clears the build cache; the `db-data` volume is the
data, so never prune volumes on this stack.

## Before others can reach it

The stack is for one machine, so follow the deployment requirements in
[docs/security-review.md](security-review.md#deployment-requirements) before
anyone else can reach it:
- HTTPS in front, with HSTS.
- `COOKIE_SECURE=true` and an `https://` `PUBLIC_ORIGIN`.
- `db` and `server` no longer published.
- Strong secrets, ideally through `<NAME>_FILE`.
