-- Server-side opt-in state for recurring automatic facial check-ins.
-- Only derived estimates are stored; images and video are never persisted.

CREATE TABLE IF NOT EXISTS facial_auto_check_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
