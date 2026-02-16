-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Settings table (global configuration)
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  role_title TEXT NOT NULL,
  role_description TEXT NOT NULL,
  ideal_candidate_profile TEXT,
  search_criteria JSONB,
  linkedin_search_url TEXT,
  priority INTEGER DEFAULT 1,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Candidates table
CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  linkedin_id TEXT,
  name TEXT NOT NULL,
  title TEXT,
  company TEXT,
  location TEXT,
  linkedin_url TEXT NOT NULL UNIQUE,
  profile_data JSONB,
  status VARCHAR(50) DEFAULT 'new',
  contacted_at TIMESTAMP,
  response_received_at TIMESTAMP,
  response_text TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_campaign_status (campaign_id, status)
);

-- Approval queue
CREATE TABLE IF NOT EXISTS approval_queue (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL,
  candidate_title TEXT,
  candidate_company TEXT,
  linkedin_url TEXT NOT NULL,
  approval_type VARCHAR(50) NOT NULL,
  proposed_text TEXT NOT NULL,
  approved_text TEXT,
  context TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  responded_at TIMESTAMP,
  sent_at TIMESTAMP,
  failed_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

-- Agent actions log
CREATE TABLE IF NOT EXISTS agent_actions (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  success BOOLEAN,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_action_date (action_type, created_at)
);

-- Rate limit tracking
CREATE TABLE IF NOT EXISTS rate_limits (
  id SERIAL PRIMARY KEY,
  limit_key VARCHAR(100) NOT NULL,
  count INTEGER DEFAULT 0,
  reset_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(limit_key, reset_at)
);

-- Default settings
INSERT INTO settings (key, value) VALUES 
('global_rate_limits', '{
  "daily_connection_requests": 15,
  "daily_messages": 20,
  "weekly_connection_cap": 80,
  "min_delay_seconds": 45,
  "max_delay_seconds": 180,
  "working_hours_start": "09:00",
  "working_hours_end": "18:00",
  "timezone": "America/Denver",
  "pause_weekends": true
}'::jsonb),
('connection_strategy', '{
  "wait_after_acceptance_hours": 36,
  "include_note_with_request": true,
  "max_follow_ups": 1,
  "follow_up_delay_days": 7
}'::jsonb),
('ai_settings', '{
  "model": "claude-3-5-sonnet-20241022",
  "temperature": 0.7,
  "max_tokens": 1000
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_candidates_campaign ON candidates(campaign_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_approval_queue_status ON approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_agent_actions_candidate ON agent_actions(candidate_id);
