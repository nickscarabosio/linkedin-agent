import axios, { AxiosInstance } from "axios";

interface Candidate {
  id: string;
  campaign_id: string;
  name: string;
  title: string;
  company: string;
  location: string;
  linkedin_url: string;
}

interface Campaign {
  id: string;
  title: string;
  role_title: string;
  role_description: string;
  ideal_candidate_profile: string;
  linkedin_search_url: string;
  priority: number;
  status: string;
}

interface ApprovalRequest {
  candidate_id: string;
  campaign_id: string;
  proposed_text: string;
  context: string;
  reasoning?: string;
  approval_type: string;
}

interface AgentAction {
  candidate_id: string;
  campaign_id: string;
  action_type: string;
  success: boolean;
  error_message?: string;
  details?: Record<string, any>;
}

interface NewCandidate {
  campaign_id: string;
  linkedin_profile_id?: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  linkedin_url: string;
  summary?: string;
  match_score?: number;
}

interface LinkedInCredentials {
  linkedin_email: string;
  encrypted_credentials: string;
  encryption_iv: string;
  encryption_auth_tag: string;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  telegram_chat_id: number | null;
  is_active: boolean;
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string, token?: string) {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  /** Update the auth token (e.g. after refresh) */
  setToken(token: string) {
    this.client.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  }

  async getUserProfile(): Promise<UserProfile> {
    const response = await this.client.get("/api/me");
    return response.data;
  }

  async getLinkedInCredentials(): Promise<LinkedInCredentials> {
    const response = await this.client.get("/api/me/linkedin-credentials");
    return response.data;
  }

  async getApprovedMessages(): Promise<any[]> {
    try {
      const response = await this.client.get("/api/approvals/pending");
      return response.data;
    } catch (error) {
      console.error("Error getting approved messages:", error);
      return [];
    }
  }

  async markApprovalSent(approvalId: string): Promise<void> {
    try {
      await this.client.patch(`/api/approvals/${approvalId}`, {
        status: "sent",
        sent_at: new Date(),
      });
    } catch (error) {
      console.error("Error marking approval as sent:", error);
    }
  }

  async markApprovalFailed(
    approvalId: string,
    reason: string
  ): Promise<void> {
    try {
      await this.client.patch(`/api/approvals/${approvalId}`, {
        status: "failed",
        failed_reason: reason,
      });
    } catch (error) {
      console.error("Error marking approval as failed:", error);
    }
  }

  async getQualifiedCandidates(): Promise<Candidate[]> {
    try {
      const response = await this.client.get("/api/candidates/qualified");
      return response.data;
    } catch (error) {
      console.error("Error getting qualified candidates:", error);
      return [];
    }
  }

  async createApprovalRequest(approval: ApprovalRequest): Promise<void> {
    try {
      await this.client.post("/api/approvals", approval);
    } catch (error) {
      console.error("Error creating approval request:", error);
      throw error;
    }
  }

  async logAction(action: AgentAction): Promise<void> {
    try {
      await this.client.post("/api/actions", action);
    } catch (error) {
      console.error("Error logging action:", error);
    }
  }

  async checkRateLimits(action: string): Promise<boolean> {
    try {
      const response = await this.client.get("/api/rate-limits", {
        params: { action },
      });
      return response.data.allowed;
    } catch (error) {
      console.error("Error checking rate limits:", error);
      return false;
    }
  }

  async getSettings(): Promise<any> {
    try {
      const response = await this.client.get("/api/settings");
      return response.data;
    } catch (error) {
      console.error("Error getting settings:", error);
      return {
        pause_weekends: true,
        working_hours_start: "09:00",
        working_hours_end: "18:00",
      };
    }
  }

  async getCandidateProfile(candidateId: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/api/candidates/${candidateId}`
      );
      return response.data;
    } catch (error) {
      console.error("Error getting candidate profile:", error);
      return null;
    }
  }

  async getActiveCampaigns(): Promise<Campaign[]> {
    try {
      const response = await this.client.get("/api/campaigns/active");
      return response.data;
    } catch (error) {
      console.error("Error getting active campaigns:", error);
      return [];
    }
  }

  async updateCandidateStatus(
    candidateId: string,
    status: string
  ): Promise<void> {
    try {
      await this.client.patch(`/api/candidates/${candidateId}`, {
        status,
        contacted_at: status === "contacted" ? new Date() : undefined,
      });
    } catch (error) {
      console.error("Error updating candidate status:", error);
    }
  }

  async createCandidate(candidate: NewCandidate): Promise<Candidate | null> {
    try {
      const response = await this.client.post("/api/candidates", candidate);
      return response.data;
    } catch (error) {
      console.error("Error creating candidate:", error);
      return null;
    }
  }
}
