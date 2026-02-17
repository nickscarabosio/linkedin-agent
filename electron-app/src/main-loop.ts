import { ClaudeClient } from "./services/claude-client";
import { LinkedInService } from "./services/linkedin-service";
import { ApiClient } from "./services/api-client";
import { randomDelay } from "./services/human-behavior";

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

    // Step 0: Log into LinkedIn
    try {
      await this.linkedin.login();
    } catch (error) {
      console.error("❌ LinkedIn login failed:", error);
      throw error;
    }

    while (this.isRunning) {
      try {
        // 1. Check working hours
        if (!(await this.isWorkingHours())) {
          console.log("⏰ Outside working hours, sleeping...");
          await this.sleep(60000);
          continue;
        }

        // 2. Process approved messages (send on LinkedIn)
        await this.processApprovedMessages();

        // 3. Discover new candidates from LinkedIn search
        await this.discoverCandidates();

        // 4. Generate messages for qualified candidates and submit for approval
        await this.findAndContactCandidates();

        // 5. Check for responses (stub)
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

  /** Send approved messages/connection requests on LinkedIn */
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
          const text = approval.approved_text || approval.proposed_text;

          if (approval.approval_type === "connection_request") {
            await this.linkedin.sendConnectionRequest(
              approval.linkedin_url,
              text
            );
          } else {
            await this.linkedin.sendMessage(approval.linkedin_url, text);
          }

          await this.api.markApprovalSent(approval.id);

          await this.api.logAction({
            candidate_id: approval.candidate_id,
            campaign_id: approval.campaign_id,
            action_type: approval.approval_type === "connection_request" ? "connection_request_sent" : "message_sent",
            success: true,
          });

          console.log(
            `✅ Sent ${approval.approval_type} to ${approval.candidate_name}`
          );

          // Human-like delay between messages (45-180s)
          await randomDelay(45000, 180000);
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

  /** Search LinkedIn for new candidates and insert them via API */
  private async discoverCandidates() {
    try {
      console.log("🔎 Discovering new candidates...");

      const campaigns = await this.api.getActiveCampaigns();
      if (campaigns.length === 0) {
        console.log("📋 No active campaigns");
        return;
      }

      for (const campaign of campaigns) {
        if (!campaign.linkedin_search_url) {
          console.log(`⏭️ Campaign "${campaign.title}" has no search URL, skipping`);
          continue;
        }

        // Check rate limits before searching
        const canSearch = await this.api.checkRateLimits("connection_request");
        if (!canSearch) {
          console.log("⚠️ Rate limit reached, skipping discovery");
          return;
        }

        const scraped = await this.linkedin.findCandidates(
          campaign.linkedin_search_url
        );

        let inserted = 0;
        for (const candidate of scraped) {
          const result = await this.api.createCandidate({
            campaign_id: campaign.id,
            name: candidate.name,
            title: candidate.title,
            company: candidate.company,
            location: candidate.location,
            linkedin_url: candidate.linkedin_url,
          });

          if (result && !(result as any).already_exists) {
            inserted++;
          }
        }

        console.log(
          `📥 Campaign "${campaign.title}": ${inserted} new candidates inserted (${scraped.length} found)`
        );

        // Delay between campaign searches
        await randomDelay(5000, 10000);
      }
    } catch (error) {
      console.error("Error discovering candidates:", error);
    }
  }

  /** Generate messages for qualified candidates and create approval requests */
  private async findAndContactCandidates() {
    try {
      console.log("🔍 Finding qualified candidates to contact...");

      const canContact = await this.api.checkRateLimits("connection_request");
      if (!canContact) {
        console.log("⚠️ Rate limit reached for today");
        return;
      }

      const candidates = await this.api.getQualifiedCandidates();

      if (candidates.length === 0) {
        console.log("✅ No new candidates to contact");
        return;
      }

      // Load campaigns for context
      const campaigns = await this.api.getActiveCampaigns();
      const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

      // Process up to 5 candidates per cycle
      for (const candidate of candidates.slice(0, 5)) {
        try {
          const campaign = campaignMap.get(candidate.campaign_id);

          const { message, reasoning } = await this.claude.generateMessage(
            candidate,
            campaign
              ? {
                  role_title: campaign.role_title,
                  role_description: campaign.role_description,
                  ideal_candidate_profile: campaign.ideal_candidate_profile,
                }
              : undefined
          );

          // All initial outreach as connection_request (can't InMail strangers)
          await this.api.createApprovalRequest({
            candidate_id: candidate.id,
            campaign_id: candidate.campaign_id,
            proposed_text: message,
            context: reasoning,
            reasoning,
            approval_type: "connection_request",
          });

          console.log(`📝 Created approval request for ${candidate.name}`);
        } catch (error) {
          console.error(
            `❌ Failed to process candidate ${candidate.id}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error("Error finding candidates:", error);
    }
  }

  private async checkForResponses() {
    try {
      console.log("📬 Checking for responses...");
      await this.linkedin.checkInbox();
      console.log("✅ Response check complete");
    } catch (error) {
      console.error("Error checking for responses:", error);
    }
  }

  private async isWorkingHours(): Promise<boolean> {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    try {
      const settings = await this.api.getSettings();

      if (settings.pause_weekends && (day === 0 || day === 6)) {
        return false;
      }

      const [startHour] = settings.working_hours_start
        .split(":")
        .map(Number);
      const [endHour] = settings.working_hours_end.split(":").map(Number);

      return hour >= startHour && hour < endHour;
    } catch (error) {
      console.error("Error checking working hours:", error);
      if (day === 0 || day === 6) return false;
      return hour >= 9 && hour < 18;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
