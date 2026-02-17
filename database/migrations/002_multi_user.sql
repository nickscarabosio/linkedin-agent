-- Multi-user migration: adds users, assignments, encrypted credentials,
-- per-user rate limits, audit logging, and refresh tokens.
-- Additive only — no column drops or table drops.

-- ============================================================
-- NEW TABLES
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  telegram_chat_id BIGINT UNIQUE,
  telegram_link_code VARCHAR(6),
  telegram_link_code_expires_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User ↔ Campaign assignments (many-to-many)
CREATE TABLE IF NOT EXISTS user_campaign_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, campaign_id)
);

-- Encrypted LinkedIn credentials per user
CREATE TABLE IF NOT EXISTS user_linkedin_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  linkedin_email VARCHAR(255),
  encrypted_credentials TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_auth_tag TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Per-user daily rate limits
CREATE TABLE IF NOT EXISTS user_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  connections_sent INTEGER NOT NULL DEFAULT 0,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  target VARCHAR(255),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Refresh tokens for JWT rotation
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ALTER EXISTING TABLES (additive only)
-- ============================================================

-- campaigns: track who created it
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- candidates: track who scraped it
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS user_scraped_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- approval_queue: track requesting user and approver
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- agent_actions: track which user's agent performed the action
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_user_campaign_assignments_user ON user_campaign_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_campaign_assignments_campaign ON user_campaign_assignments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_user_rate_limits_user_date ON user_rate_limits(user_id, date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_approval_queue_user ON approval_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_user ON agent_actions(user_id);
