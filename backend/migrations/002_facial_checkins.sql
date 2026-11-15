-- Opt-in facial check-ins for Supabase PostgreSQL.
-- Stores only derived estimates; images and video are never persisted.

CREATE TABLE IF NOT EXISTS facial_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expression VARCHAR(40) NOT NULL CHECK (
    expression IN (
      'neutral', 'happiness', 'surprise', 'sadness',
      'anger', 'disgust', 'fear', 'contempt'
    )
  ),
  expression_label VARCHAR(60) NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  stress_level INTEGER NOT NULL CHECK (stress_level >= 1 AND stress_level <= 5),
  mood VARCHAR(60) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facial_checkins_user
  ON facial_check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_facial_checkins_created
  ON facial_check_ins(created_at DESC);
