-- Anonymous shareable tissue-box designs for the Netlify build. Ids are random UUIDs (unguessable).
CREATE TABLE IF NOT EXISTS dlcj_designs (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  design jsonb NOT NULL,
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 1 AND 5000000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dlcj_designs_created_at ON dlcj_designs (created_at);
