-- Support centre: generalise severity_reports into typed support requests.
-- Safe to run on an existing database; existing rows become general support requests.

ALTER TABLE severity_reports
  ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) NOT NULL DEFAULT 'support',
  ADD COLUMN IF NOT EXISTS title VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category VARCHAR(60) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS preferred_date VARCHAR(10) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preferred_time VARCHAR(5) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS location_pref VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS admin_response TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_severity_reports_request_type
  ON severity_reports (request_type);
