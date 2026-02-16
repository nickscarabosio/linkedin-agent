import axios, { AxiosInstance } from "axios";

interface Candidate {
  id: number;
  campaign_id: number;
  name: string;
  title: string;
  company: string;
  linkedin_url: string;
}

interface ApprovalRequest {
  id?: number;
  candidate_id: number;
  campaign_id: number;
  candidate_name: string;
  candidate_title: string;
  candidate_company: string;
  linkedin_url: string;
  proposed_text: string;
  context: string;
  approval_type: string;
}

interface AgentAction {
  candidate_id: number;
  campaign_id: number;
  action_type: string;
  success: boolean;
  error_message?: string;
  metadata?: Record<string, any>;
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
    });
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

  async markApprovalSent(approvalId: number): Promise<void> {
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
    approvalId: number,
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
      // Return defaults
      return {
        pause_weekends: true,
        working_hours_start: "09:00",
        working_hours_end: "18:00",
      };
    }
  }

  async getCandidateProfile(candidateId: number): Promise<any> {
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
}
