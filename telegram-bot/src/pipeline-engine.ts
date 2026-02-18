import { Pool } from "pg";

// ============================================================
// Pipeline Status Types
// ============================================================

export type PipelineStatus =
  | "identified"
  | "connection_sent"
  | "connection_expired"
  | "connected_no_message"
  | "message_1_sent"
  | "message_2_sent"
  | "inmail_sent"
  | "replied_positive"
  | "replied_negative"
  | "replied_maybe"
  | "qualify_link_sent"
  | "qualified"
  | "intro_booked"
  | "client_reviewing"
  | "offer_extended"
  | "placed"
  | "passed"
  | "not_a_fit"
  | "archived";

// ============================================================
// Valid Transitions Map (from spec Part 4)
// ============================================================

const VALID_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  identified: ["connection_sent", "archived"],
  connection_sent: ["connected_no_message", "connection_expired", "archived"],
  connection_expired: ["inmail_sent", "archived"],
  connected_no_message: ["message_1_sent"],
  message_1_sent: [
    "replied_positive",
    "replied_negative",
    "replied_maybe",
    "message_2_sent",
  ],
  message_2_sent: [
    "replied_positive",
    "replied_negative",
    "replied_maybe",
    "archived",
  ],
  inmail_sent: [
    "replied_positive",
    "replied_negative",
    "replied_maybe",
    "archived",
  ],
  replied_positive: ["qualify_link_sent"],
  replied_negative: ["not_a_fit"],
  replied_maybe: ["qualify_link_sent"],
  qualify_link_sent: ["qualified", "archived"],
  qualified: ["intro_booked", "not_a_fit"],
  intro_booked: ["client_reviewing"],
  client_reviewing: ["offer_extended", "passed"],
  offer_extended: ["placed", "not_a_fit"],
  placed: [],
  passed: ["archived"],
  not_a_fit: ["archived"],
  archived: [],
};

// ============================================================
// Timing Rules (minimum delays between transitions)
// ============================================================

interface TimingRule {
  from: PipelineStatus;
  to: PipelineStatus;
  minDelayMs: number;
  description: string;
}

const TIMING_RULES: TimingRule[] = [
  {
    from: "connected_no_message",
    to: "message_1_sent",
    minDelayMs: 24 * 60 * 60 * 1000, // 24 hours
    description: "Must wait 24 hours after connection accepted before first message",
  },
  {
    from: "message_1_sent",
    to: "message_2_sent",
    minDelayMs: 5 * 24 * 60 * 60 * 1000, // 5 business days (~5 calendar days)
    description: "Must wait 5 business days after message 1 before follow-up",
  },
  {
    from: "message_2_sent",
    to: "archived",
    minDelayMs: 7 * 24 * 60 * 60 * 1000, // 7 business days
    description: "Must wait 7 business days after message 2 before archiving",
  },
  {
    from: "inmail_sent",
    to: "archived",
    minDelayMs: 14 * 24 * 60 * 60 * 1000, // 14 calendar days
    description: "Must wait 14 calendar days after InMail before archiving",
  },
  {
    from: "connection_sent",
    to: "connection_expired",
    minDelayMs: 21 * 24 * 60 * 60 * 1000, // 21 calendar days
    description: "Connection request expires after 21 calendar days",
  },
];

// ============================================================
// PipelineEngine
// ============================================================

export class PipelineEngine {
  constructor(private db: Pool) {}

  /**
   * Get valid next statuses from current status
   */
  getValidTransitions(currentStatus: PipelineStatus): PipelineStatus[] {
    return VALID_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Check if a transition is allowed, considering both validity and timing rules
   */
  async canTransition(
    candidateId: string,
    targetStatus: PipelineStatus
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Get current status + timestamp
    const result = await this.db.query(
      `SELECT pipeline_status, updated_at, created_at FROM candidates WHERE id = $1`,
      [candidateId]
    );

    if (result.rows.length === 0) {
      return { allowed: false, reason: "Candidate not found" };
    }

    const currentStatus = (result.rows[0].pipeline_status ||
      "identified") as PipelineStatus;

    // Check if transition is valid
    const validNextStatuses = this.getValidTransitions(currentStatus);
    if (!validNextStatuses.includes(targetStatus)) {
      return {
        allowed: false,
        reason: `Cannot transition from "${currentStatus}" to "${targetStatus}". Valid transitions: ${validNextStatuses.join(", ") || "none"}`,
      };
    }

    // Check timing rules
    const timingRule = TIMING_RULES.find(
      (r) => r.from === currentStatus && r.to === targetStatus
    );

    if (timingRule) {
      // Find when the candidate entered the current status
      const statusTimestamp = await this.getStatusEnteredAt(
        candidateId,
        currentStatus
      );

      if (statusTimestamp) {
        const elapsed = Date.now() - statusTimestamp.getTime();
        if (elapsed < timingRule.minDelayMs) {
          const remainingMs = timingRule.minDelayMs - elapsed;
          const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
          return {
            allowed: false,
            reason: `${timingRule.description}. ${remainingHours} hours remaining.`,
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Transition a candidate to a new pipeline_status, enforcing rules.
   * Throws if the transition is not allowed.
   */
  async transitionCandidate(
    candidateId: string,
    newStatus: PipelineStatus,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const check = await this.canTransition(candidateId, newStatus);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    // Get current status for logging
    const current = await this.db.query(
      `SELECT pipeline_status FROM candidates WHERE id = $1`,
      [candidateId]
    );
    const oldStatus = current.rows[0]?.pipeline_status || "identified";

    // Update the status
    await this.db.query(
      `UPDATE candidates SET pipeline_status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, candidateId]
    );

    // Log the transition as an agent action
    await this.db.query(
      `INSERT INTO agent_actions (candidate_id, action_type, success, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        candidateId,
        "pipeline_transition",
        true,
        JSON.stringify({
          from: oldStatus,
          to: newStatus,
          ...metadata,
        }),
      ]
    );
  }

  /**
   * Force-transition (skip timing checks but still validate the transition path).
   * Used for manual overrides by admins.
   */
  async forceTransition(
    candidateId: string,
    newStatus: PipelineStatus,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const result = await this.db.query(
      `SELECT pipeline_status FROM candidates WHERE id = $1`,
      [candidateId]
    );

    if (result.rows.length === 0) {
      throw new Error("Candidate not found");
    }

    const currentStatus = (result.rows[0].pipeline_status ||
      "identified") as PipelineStatus;

    // Still validate the transition path exists (but skip timing)
    const validNextStatuses = this.getValidTransitions(currentStatus);
    if (!validNextStatuses.includes(newStatus)) {
      throw new Error(
        `Cannot transition from "${currentStatus}" to "${newStatus}". Valid transitions: ${validNextStatuses.join(", ") || "none"}`
      );
    }

    await this.db.query(
      `UPDATE candidates SET pipeline_status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, candidateId]
    );

    await this.db.query(
      `INSERT INTO agent_actions (candidate_id, action_type, success, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        candidateId,
        "pipeline_transition_forced",
        true,
        JSON.stringify({
          from: currentStatus,
          to: newStatus,
          ...metadata,
        }),
      ]
    );
  }

  /**
   * Find candidates whose connection requests have expired (21+ days in connection_sent).
   * Returns candidate IDs that should transition to connection_expired.
   */
  async findExpiredConnections(): Promise<string[]> {
    const expiryMs = 21 * 24 * 60 * 60 * 1000;
    const expiryDate = new Date(Date.now() - expiryMs);

    const result = await this.db.query(
      `SELECT c.id FROM candidates c
       JOIN agent_actions aa ON aa.candidate_id = c.id
         AND aa.action_type = 'pipeline_transition'
         AND aa.metadata->>'to' = 'connection_sent'
       WHERE c.pipeline_status = 'connection_sent'
         AND aa.created_at < $1
       GROUP BY c.id`,
      [expiryDate]
    );

    return result.rows.map((r: any) => r.id);
  }

  /**
   * Find candidates in message_2_sent or inmail_sent that have timed out
   * and should be archived.
   */
  async findTimedOutCandidates(): Promise<
    { id: string; status: PipelineStatus }[]
  > {
    const results: { id: string; status: PipelineStatus }[] = [];

    // message_2_sent: 7 business days (~7 calendar days for simplicity)
    const msg2Expiry = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const msg2Result = await this.db.query(
      `SELECT c.id FROM candidates c
       JOIN agent_actions aa ON aa.candidate_id = c.id
         AND aa.action_type = 'pipeline_transition'
         AND aa.metadata->>'to' = 'message_2_sent'
       WHERE c.pipeline_status = 'message_2_sent'
         AND aa.created_at < $1
       GROUP BY c.id`,
      [msg2Expiry]
    );
    for (const row of msg2Result.rows) {
      results.push({ id: row.id, status: "message_2_sent" });
    }

    // inmail_sent: 14 calendar days
    const inmailExpiry = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const inmailResult = await this.db.query(
      `SELECT c.id FROM candidates c
       JOIN agent_actions aa ON aa.candidate_id = c.id
         AND aa.action_type = 'pipeline_transition'
         AND aa.metadata->>'to' = 'inmail_sent'
       WHERE c.pipeline_status = 'inmail_sent'
         AND aa.created_at < $1
       GROUP BY c.id`,
      [inmailExpiry]
    );
    for (const row of inmailResult.rows) {
      results.push({ id: row.id, status: "inmail_sent" });
    }

    return results;
  }

  /**
   * Get timestamp of when candidate entered a specific status.
   * Looks at agent_actions for the transition log.
   */
  private async getStatusEnteredAt(
    candidateId: string,
    status: PipelineStatus
  ): Promise<Date | null> {
    const result = await this.db.query(
      `SELECT created_at FROM agent_actions
       WHERE candidate_id = $1
         AND action_type IN ('pipeline_transition', 'pipeline_transition_forced')
         AND metadata->>'to' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [candidateId, status]
    );

    if (result.rows.length > 0) {
      return new Date(result.rows[0].created_at);
    }

    // Fallback: use the candidate's updated_at
    const fallback = await this.db.query(
      `SELECT updated_at FROM candidates WHERE id = $1`,
      [candidateId]
    );

    return fallback.rows.length > 0
      ? new Date(fallback.rows[0].updated_at)
      : null;
  }
}
