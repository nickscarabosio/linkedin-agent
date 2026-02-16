// Campaign types
export interface Campaign {
  id: number;
  title: string;
  role_title: string;
  role_description: string;
  ideal_candidate_profile: string;
  search_criteria: Record<string, any>;
  linkedin_search_url: string;
  priority: number;
  status: "active" | "paused" | "completed";
  created_at: Date;
  updated_at: Date;
}

// Candidate types
export interface Candidate {
  id: number;
  campaign_id: number;
  linkedin_id: string;
  name: string;
  title: string;
  company: string;
  location: string;
  linkedin_url: string;
  profile_data: Record<string, any>;
  status: "new" | "contacted" | "responded" | "rejected";
  contacted_at: Date | null;
  response_received_at: Date | null;
  response_text: string | null;
  created_at: Date;
  updated_at: Date;
}

// Approval types
export interface ApprovalRequest {
  id: number;
  candidate_id: number;
  campaign_id: number;
  candidate_name: string;
  candidate_title: string;
  candidate_company: string;
  linkedin_url: string;
  approval_type: "connection_request" | "message";
  proposed_text: string;
  approved_text: string | null;
  context: string;
  status: "pending" | "approved" | "rejected" | "sent" | "failed";
  responded_at: Date | null;
  sent_at: Date | null;
  failed_reason: string | null;
  created_at: Date;
}

// Action log types
export interface AgentAction {
  id: number;
  candidate_id: number;
  campaign_id: number;
  action_type: string;
  success: boolean;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: Date;
}

// Settings types
export interface RateLimitSettings {
  daily_connection_requests: number;
  daily_messages: number;
  weekly_connection_cap: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  working_hours_start: string;
  working_hours_end: string;
  timezone: string;
  pause_weekends: boolean;
}

export interface ConnectionStrategy {
  wait_after_acceptance_hours: number;
  include_note_with_request: boolean;
  max_follow_ups: number;
  follow_up_delay_days: number;
}

export interface AISettings {
  model: string;
  temperature: number;
  max_tokens: number;
}

// Claude message types
export interface GenerateMessageRequest {
  candidate: Candidate;
  campaign: Campaign;
  context?: Record<string, any>;
}

export interface GenerateMessageResponse {
  message: string;
  reasoning: string;
  tone: string;
  tokens_used: number;
}
