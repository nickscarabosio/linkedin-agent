import { ClaudeClient } from "./services/claude-client";
import { LinkedInService } from "./services/linkedin-service";
import { ApiClient } from "./services/api-client";

export class MainLoop {
  private isRunning = false;
  private readonly LOOP_INTERVAL = 30000; // 30 seconds

  constructor(
    private claude: ClaudeClient,
    private linkedin: LinkedInService,
    private api: ApiClient
  ) {}

  async start() {
    this.isRunning = true;
    console.log("🎯 Main recruiting loop started");

    while (this.isRunning) {
      try {
        // 1. Check working hours
        if (!(await this.isWorkingHours())) {
          console.log("⏰ Outside working hours, sleeping...");
          await this.sleep(60000);
          continue;
        }

        // 2. Process approved messages
        await this.processApprovedMessages();

        // 3. Find new candidates to contact
        await this.findAndContactCandidates();

        // 4. Check for responses
        await this.checkForResponses();

        // Sleep before next iteration
        await this.sleep(this.LOOP_INTERVAL);
      } catch (error) {
        console.error("❌ Error in main loop:", error);
        await this.sleep(60000);
      }
    }
  }

  async stop() {
    console.log("⏸️ Stopping main loop...");
    this.isRunning = false;
  }

  private async processApprovedMessages() {
    try {
      console.log("📤 Processing approved messages...");
      const approved = await this.api.getApprovedMessages();

      if (approved.length === 0) {
        console.log("✅ No approved messages to send");
        return;
      }

      for (const approval of approved) {
        try {
          // Send the message based on type
          if (approval.approval_type === "connection_request") {
            await this.linkedin.sendConnectionRequest(
              approval.linkedin_url,
              approval.approved_text || approval.proposed_text
            );
          } else {
            await this.linkedin.sendMessage(
              approval.linkedin_url,
              approval.approved_text || approval.proposed_text
            );
          }

          // Mark as sent
          await this.api.markApprovalSent(approval.id);

          // Log action
          await this.api.logAction({
            candidate_id: approval.candidate_id,
            campaign_id: approval.campaign_id,
            action_type: approval.approval_type,
            success: true,
          });

          console.log(
            `✅ Sent ${approval.approval_type} to ${approval.candidate_name}`
          );

          // Random delay between messages
          await this.sleep(this.randomDelay());
        } catch (error) {
          console.error(`❌ Failed to send approval ${approval.id}:`, error);
          await this.api.markApprovalFailed(
            approval.id,
            error instanceof Error ? error.message : "Unknown error"
          );
        }
      }
    } catch (error) {
      console.error("Error processing approved messages:", error);
    }
  }

  private async findAndContactCandidates() {
    try {
      console.log("🔍 Finding new candidates...");

      // Check rate limits
      const canContact = await this.api.checkRateLimits("message_sent");
      if (!canContact) {
        console.log("⚠️ Rate limit reached for today");
        return;
      }

      // Get qualified candidates who haven't been contacted yet
      const candidates = await this.api.getQualifiedCandidates();

      if (candidates.length === 0) {
        console.log("✅ No new candidates to contact");
        return;
      }

      // Process up to 5 candidates per cycle
      for (const candidate of candidates.slice(0, 5)) {
        try {
          // Generate message using Claude
          const { message, reasoning } = await this.claude.generateMessage(
            candidate
          );

          // Create approval request
          await this.api.createApprovalRequest({
            candidate_id: candidate.id,
            campaign_id: candidate.campaign_id,
            candidate_name: candidate.name,
            candidate_title: candidate.title,
            candidate_company: candidate.company,
            linkedin_url: candidate.linkedin_url,
            proposed_text: message,
            context: reasoning,
            approval_type: "message",
          });

          console.log(`📝 Created approval request for ${candidate.name}`);
        } catch (error) {
          console.error(`❌ Failed to process candidate ${candidate.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Error finding candidates:", error);
    }
  }

  private async checkForResponses() {
    try {
      console.log("📬 Checking for responses...");
      // TODO: Implement response checking from LinkedIn inbox
      console.log("✅ Response check complete");
    } catch (error) {
      console.error("Error checking for responses:", error);
    }
  }

  private async isWorkingHours(): Promise<boolean> {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Get settings from API
    try {
      const settings = await this.api.getSettings();
      const pause_weekends = settings.pause_weekends;

      if (pause_weekends && (day === 0 || day === 6)) {
        return false;
      }

      const [startHour] = settings.working_hours_start
        .split(":")
        .map(Number);
      const [endHour] = settings.working_hours_end.split(":").map(Number);

      return hour >= startHour && hour < endHour;
    } catch (error) {
      console.error("Error checking working hours:", error);
      // Fallback: 9am-6pm, no weekends
      if (day === 0 || day === 6) return false;
      return hour >= 9 && hour < 18;
    }
  }

  private randomDelay(): number {
    // Random delay between 45-180 seconds
    return Math.floor(Math.random() * (180000 - 45000 + 1)) + 45000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
