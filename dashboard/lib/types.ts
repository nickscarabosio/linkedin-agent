// API response types

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  telegram_chat_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Campaign {
  id: string;
  title: string;
  role_title: string;
  role_description: string;
  ideal_candidate_profile: string | null;
  linkedin_search_url: string | null;
  pipeline_id: string | null;
  status: "active" | "paused" | "completed";
  priority: number;
  created_at: string;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  assigned_user_names?: string[] | null;
  assigned_users?: { id: string; name: string }[];
}

export interface Candidate {
  id: string;
  campaign_id: string;
  campaign_title?: string;
  name: string;
  title: string;
  company: string;
  location: string;
  linkedin_url: string;
  status: "new" | "contacted" | "responded" | "rejected" | "skipped" | "archived";
  created_at: string;
}

export interface UnifiedCandidate {
  id: string;
  campaign_id: string;
  campaign_title: string;
  name: string;
  title: string;
  company: string;
  location: string;
  linkedin_url: string;
  status: "new" | "contacted" | "responded" | "rejected" | "skipped" | "archived";
  created_at: string;
  contacted_at: string | null;
  owner_id: string | null;
  owner_name: string | null;
  approval_id: string | null;
  approval_status: "pending" | "approved" | "rejected" | "sent" | "failed" | null;
  approval_type: string | null;
  proposed_text: string | null;
  approval_context: string | null;
  approval_created_at: string | null;
  pipeline_stage: string | null;
}

export interface Approval {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_title: string;
  candidate_company: string;
  linkedin_url: string;
  approval_type: string;
  proposed_text: string;
  context: string | null;
  reasoning: string | null;
  status: "pending" | "approved" | "rejected" | "sent" | "failed";
  created_at: string;
  responded_at: string | null;
}

export interface CandidateNote {
  id: string;
  candidate_id: string;
  user_id: string;
  content: string;
  remind_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminStats {
  active_campaigns: number;
  total_candidates: number;
  pending_approvals: number;
  today_actions: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  type: "connection_request" | "message" | "follow_up" | "inmail";
  body: string;
  created_by: string | null;
  created_at: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  stages?: PipelineStage[];
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  stage_order: number;
  name: string;
  action_type: "connection_request" | "message" | "follow_up" | "wait" | "reminder" | "inmail" | "profile_view" | "withdraw";
  delay_days: number;
  requires_approval: boolean;
  template_id: string | null;
  config: Record<string, unknown>;
}

export interface CandidatePipelineProgress {
  id: string;
  candidate_id: string;
  pipeline_stage_id: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "failed";
  started_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  stage_name?: string;
  stage_order?: number;
  action_type?: string;
}

export interface ParsedJD {
  title: string;
  role_title: string;
  role_description: string;
  ideal_candidate_profile: string;
  linkedin_search_url: string;
}

export interface Settings {
  daily_connection_requests: number;
  daily_messages: number;
  weekly_connection_cap: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  working_hours_start: string;
  working_hours_end: string;
  timezone: string;
  pause_weekends: boolean;
  model: string;
  temperature: number;
  max_tokens: number;
  wait_after_acceptance_hours: number;
  include_note_with_request: boolean;
  max_follow_ups: number;
  follow_up_delay_days: number;
}
