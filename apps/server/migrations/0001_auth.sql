-- Accounts and everything that authenticates them. Forward-only.
--
-- Every secret (session cookie, API token, invite and reset link) is stored as
-- its SHA-256 hash; the plain value is shown to its owner once.

CREATE TABLE users (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Lowercase by construction: the app lowercases input, and the pattern
    -- has no capitals.
    username            text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
    display_name        text NOT NULL DEFAULT '' CHECK (length(display_name) <= 100),
    password_hash       text NOT NULL,
    role                text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    -- IANA zone; used when a request has no X-TaskMint-TZ header.
    time_zone           text NOT NULL DEFAULT 'UTC',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    password_changed_at timestamptz NOT NULL DEFAULT now(),
    -- Users are disabled, never deleted, so history keeps its references.
    disabled_at         timestamptz
);

CREATE TABLE invites (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash bytea NOT NULL UNIQUE,
    role       text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    note       text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
    -- NULL: created from the command line.
    created_by uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    used_by    uuid REFERENCES users (id),
    revoked_at timestamptz
);

CREATE TABLE password_resets (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id),
    token_hash bytea NOT NULL UNIQUE,
    -- NULL: created from the command line.
    created_by uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz
);
CREATE INDEX password_resets_user_id ON password_resets (user_id);

-- Browser sessions (the taskmint_session cookie). expires_at slides forward
-- on every authenticated request.
CREATE TABLE auth_sessions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash   bytea NOT NULL UNIQUE,
    csrf_token   text NOT NULL,
    user_id      uuid NOT NULL REFERENCES users (id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    user_agent   text NOT NULL DEFAULT '',
    ip           text NOT NULL DEFAULT ''
);
CREATE INDEX auth_sessions_user_id ON auth_sessions (user_id);

-- Bearer tokens: `capture` for the browser extension, `full` for the desktop
-- app (kind 'device', made by POST auth/device-token) and scripts.
CREATE TABLE api_tokens (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users (id),
    name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    scope        text NOT NULL CHECK (scope IN ('capture', 'full')),
    kind         text NOT NULL DEFAULT 'api' CHECK (kind IN ('api', 'device')),
    -- The first characters of the secret, so a list can tell tokens apart.
    token_prefix text NOT NULL,
    token_hash   bytea NOT NULL UNIQUE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    revoked_at   timestamptz
);
CREATE INDEX api_tokens_user_id ON api_tokens (user_id);

CREATE TABLE audit_events (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at             timestamptz NOT NULL DEFAULT now(),
    -- NULL: the command line or the server itself (admin bootstrap).
    actor_id       uuid REFERENCES users (id),
    action         text NOT NULL,
    target_user_id uuid REFERENCES users (id),
    detail         jsonb NOT NULL DEFAULT '{}',
    ip             text
);
CREATE INDEX audit_events_at ON audit_events (at);
