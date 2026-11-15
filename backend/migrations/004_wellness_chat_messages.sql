-- Persisted AI wellness conversations (per user).
-- Only chat text is stored; no images or audio.

CREATE TABLE IF NOT EXISTS wellness_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(12) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  crisis BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wellness_chat_user
  ON wellness_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_wellness_chat_created
  ON wellness_chat_messages(created_at DESC);
