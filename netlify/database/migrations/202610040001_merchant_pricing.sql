-- Netlify launch adapter. Existing SQLite data and store tables are untouched.
CREATE TABLE IF NOT EXISTS dlcj_pricing (
  id integer PRIMARY KEY CHECK (id = 1),
  version integer NOT NULL CHECK (version >= 1),
  standard_fen integer NOT NULL CHECK (standard_fen BETWEEN 1 AND 1000000),
  custom_fen integer NOT NULL CHECK (custom_fen BETWEEN 1 AND 1000000),
  updated_at timestamptz
);
INSERT INTO dlcj_pricing VALUES (1, 1, 9900, 15900, NULL) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS dlcj_pricing_audit (
  id uuid PRIMARY KEY,
  actor_id text NOT NULL,
  actor_label text NOT NULL,
  at timestamptz NOT NULL,
  before_price jsonb NOT NULL,
  after_price jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS dlcj_pricing_operations (
  actor_id text NOT NULL,
  operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 16 AND 100),
  payload_hash text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (actor_id, operation_key)
);
CREATE TABLE IF NOT EXISTS dlcj_merchant_sessions (
  token_hash text PRIMARY KEY,
  credential_version text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS dlcj_merchant_sessions_expiry ON dlcj_merchant_sessions(expires_at);
CREATE TABLE IF NOT EXISTS dlcj_merchant_login_limits (
  bucket text PRIMARY KEY,
  window_start bigint NOT NULL,
  attempts integer NOT NULL
);
