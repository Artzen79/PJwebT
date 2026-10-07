-- every email the system sends is kept here and shown in the web app (member inbox, admin mail log);
-- web = in the web app only (no SMTP configured), sent = also delivered by SMTP, failed = SMTP delivery failed
CREATE TYPE email_status AS ENUM ('web', 'sent', 'failed');

CREATE TABLE emails (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  booking_id int REFERENCES bookings(id) ON DELETE SET NULL,
  kind text NOT NULL,
  to_address text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  status email_status NOT NULL DEFAULT 'web',
  error text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX emails_by_user ON emails (user_id, created_at DESC);

-- admin-editable settings; a missing key falls back to the default in code
CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by int REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
