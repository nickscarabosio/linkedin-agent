-- Migration 006: Scoring system, pipeline_status, job_spec, seed message templates

-- ============================================================
-- CAMPAIGNS: add job_spec JSONB column
-- ============================================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS job_spec JSONB DEFAULT '{}';

-- ============================================================
-- CANDIDATES: add scoring + pipeline_status columns
-- ============================================================
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS pipeline_status VARCHAR(50) DEFAULT 'identified';
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS score_data JSONB;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS total_score INTEGER;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS score_bucket VARCHAR(20);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS personalization_hook TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

-- ============================================================
-- UPDATE CHECK CONSTRAINTS for expanded action/template types
-- ============================================================
ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_action_type_check;
ALTER TABLE pipeline_stages ADD CONSTRAINT pipeline_stages_action_type_check
  CHECK (action_type IN ('connection_request', 'message', 'follow_up', 'wait', 'reminder', 'inmail', 'profile_view', 'withdraw'));

ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_type_check;
ALTER TABLE message_templates ADD CONSTRAINT message_templates_type_check
  CHECK (type IN ('connection_request', 'message', 'follow_up', 'inmail'));

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_candidates_pipeline_status ON candidates(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_candidates_score_bucket ON candidates(score_bucket);
CREATE INDEX IF NOT EXISTS idx_candidates_total_score ON candidates(total_score);

-- ============================================================
-- SEED MESSAGE TEMPLATES (5 templates from recruiting spec)
-- ============================================================

-- Template 1: Connection Request Note (primary)
INSERT INTO message_templates (name, type, body) VALUES
(
  'Connection Request — Personalized Hook',
  'connection_request',
  E'Hi {{first_name}} — {{hook}} caught my eye. I work with growth-stage companies filling key leadership roles and have a {{function}} position that may be worth a quick look. Happy to share details if there''s any interest.'
);

-- Template 1b: Connection Request Note (fallback, no strong hook)
INSERT INTO message_templates (name, type, body) VALUES
(
  'Connection Request — Standard Fallback',
  'connection_request',
  E'Hi {{first_name}} — your background in {{function}} at {{company_type}} companies stood out. I represent a client with a {{role_level}} {{function}} role that may be a fit. Worth a quick conversation?'
);

-- Template 2: Message 1 (After Connection Accepted)
INSERT INTO message_templates (name, type, body) VALUES
(
  'Message 1 — After Connection Accepted',
  'message',
  E'Thanks for connecting, {{first_name}}.\n\nI''ll keep this brief — I''m working with {{client_description_external}} looking for a {{role_level}} {{function}} leader. Based on your background, you came to mind immediately.\n\nI''m not looking to waste your time — would it make sense for me to send over a few details so you can decide if it''s worth a conversation?'
);

-- Template 3: Message 2 (Follow-Up, No Reply)
INSERT INTO message_templates (name, type, body) VALUES
(
  'Message 2 — Follow-Up No Reply',
  'follow_up',
  E'Hey {{first_name}} — just circling back on my last note.\n\nI know timing matters with these things. The {{role_level}} {{function}} role I mentioned is still open and the client is moving. If it''s not relevant right now, no worries at all — just wanted to make sure it didn''t get buried.\n\nHappy to share a one-pager if you''re even mildly curious.'
);

-- Template 4: InMail (Last Resort)
INSERT INTO message_templates (name, type, body) VALUES
(
  'InMail — Last Resort Outreach',
  'inmail',
  E'Hi {{first_name}},\n\nI reached out via connection request recently but wanted to make sure this hit your radar.\n\nI''m a recruiting partner working exclusively with {{client_description_external}}. They''re looking for a {{role_level}} {{function}} leader — someone with your background in {{industry}} at a {{company_type}} company.\n\nThe role is: {{role_one_liner}}\n\nIf this is even a 6/10 interesting, I''d love to send more detail. No pressure, no hard sell.\n\n— {{recruiter_name}}'
);

-- Template 5: Positive Reply Response + Qualify Link
INSERT INTO message_templates (name, type, body) VALUES
(
  'Positive Reply — Qualify Link',
  'message',
  E'Great to hear from you, {{first_name}}!\n\nHere''s a quick overview link with the role details and a few short questions — should take you less than 5 minutes: {{qualify_link}}\n\nOnce I see your responses I can set up a call and give you the full picture including the client name.\n\nLooking forward to it.'
);
