CREATE TABLE auth_session_revocations (
  session_key text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_session_revocations_expiry ON auth_session_revocations(expires_at);
