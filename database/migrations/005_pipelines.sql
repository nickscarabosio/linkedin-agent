-- Pipelines: reusable outreach sequence templates
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pipeline stages: ordered steps in a pipeline
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_order INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('connection_request', 'message', 'follow_up', 'wait', 'reminder')),
  delay_days INTEGER DEFAULT 0,
  requires_approval BOOLEAN DEFAULT TRUE,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pipeline_id, stage_order)
);

-- Track candidate progress through pipeline stages
CREATE TABLE candidate_pipeline_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  pipeline_stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(candidate_id, pipeline_stage_id)
);

-- Add pipeline_id to campaigns
ALTER TABLE campaigns ADD COLUMN pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL;

-- Add pipeline_stage_id to approval_queue
ALTER TABLE approval_queue ADD COLUMN pipeline_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_pipeline_stages_pipeline_id ON pipeline_stages(pipeline_id);
CREATE INDEX idx_candidate_pipeline_progress_candidate ON candidate_pipeline_progress(candidate_id);
CREATE INDEX idx_candidate_pipeline_progress_stage ON candidate_pipeline_progress(pipeline_stage_id);
CREATE INDEX idx_campaigns_pipeline_id ON campaigns(pipeline_id);

-- Seed default "Standard Outreach" pipeline
INSERT INTO pipelines (name, description, is_default) VALUES
  ('Standard Outreach', 'Default 5-stage outreach sequence: connect, wait, message, follow-up, reminder', TRUE);

DO $$
DECLARE
  pid UUID;
BEGIN
  SELECT id INTO pid FROM pipelines WHERE is_default = TRUE LIMIT 1;

  INSERT INTO pipeline_stages (pipeline_id, stage_order, name, action_type, delay_days, requires_approval) VALUES
    (pid, 1, 'Send Connection Request', 'connection_request', 0, TRUE),
    (pid, 2, 'Wait for Acceptance', 'wait', 3, FALSE),
    (pid, 3, 'Send Introduction Message', 'message', 1, TRUE),
    (pid, 4, 'Follow Up', 'follow_up', 5, TRUE),
    (pid, 5, 'Internal Reminder', 'reminder', 7, FALSE);
END $$;
