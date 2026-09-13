-- REVIEW ONLY. Do not apply before the reliability branch is approved.
-- All statements are additive and preserve existing user data.

CREATE TABLE IF NOT EXISTS np_push_deliveries (
  ticket_id text PRIMARY KEY,
  nudge_id text NOT NULL REFERENCES np_nudges(id) ON DELETE CASCADE,
  recipient_id text NOT NULL REFERENCES np_users(id) ON DELETE CASCADE,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  receipt_error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_np_push_deliveries_recipient"
  ON np_push_deliveries(recipient_id);

CREATE TABLE IF NOT EXISTS np_auth_rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS np_storage_uploads (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES np_users(id) ON DELETE CASCADE,
  object_path text NOT NULL UNIQUE,
  name text NOT NULL,
  purpose text NOT NULL DEFAULT 'avatar',
  declared_size integer NOT NULL,
  declared_content_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  uploaded_size integer,
  uploaded_content_type text,
  created_at timestamp NOT NULL DEFAULT now(),
  finalized_at timestamp
);
CREATE INDEX IF NOT EXISTS "IDX_np_storage_uploads_owner"
  ON np_storage_uploads(owner_id);
CREATE INDEX IF NOT EXISTS "IDX_np_storage_uploads_status"
  ON np_storage_uploads(status);
