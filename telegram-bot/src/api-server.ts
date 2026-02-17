import express, { Request, Response } from "express";
import cors from "cors";
import { Pool } from "pg";
import { sendApprovalNotification } from "./telegram-notifier";

export function createApiServer(db: Pool) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // GET /api/approvals/pending - approved messages ready to send
  // Joins candidates to get name/title/company/linkedin_url since approval_queue doesn't store them
  app.get("/api/approvals/pending", async (_req: Request, res: Response) => {
    try {
      const result = await db.query(
        `SELECT aq.*, c.name AS candidate_name, c.title AS candidate_title,
                c.company AS candidate_company, c.linkedin_url
         FROM approval_queue aq
         JOIN candidates c ON aq.candidate_id = c.id
         WHERE aq.status = 'approved'
         ORDER BY aq.created_at ASC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/approvals/pending error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/approvals/:id - update approval status
  app.patch("/api/approvals/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, sent_at, failed_reason } = req.body;

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (status) {
        setClauses.push(`status = $${idx++}`);
        values.push(status);
      }
      if (sent_at) {
        setClauses.push(`sent_at = $${idx++}`);
        values.push(sent_at);
      }
      if (failed_reason !== undefined) {
        setClauses.push(`failed_reason = $${idx++}`);
        values.push(failed_reason);
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      values.push(id);
      const result = await db.query(
        `UPDATE approval_queue SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("PATCH /api/approvals/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/candidates/qualified - new candidates with active campaigns, no existing approval
  app.get("/api/candidates/qualified", async (_req: Request, res: Response) => {
    try {
      const result = await db.query(
        `SELECT c.* FROM candidates c
         JOIN campaigns camp ON c.campaign_id = camp.id AND camp.status = 'active'
         WHERE c.status = 'new'
           AND NOT EXISTS (
             SELECT 1 FROM approval_queue aq
             WHERE aq.candidate_id = c.id
           )
         ORDER BY c.created_at ASC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/candidates/qualified error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/approvals - create approval + send Telegram notification
  // Live schema: approval_queue has candidate_id, campaign_id, approval_type, proposed_text, context, reasoning
  // Does NOT have candidate_name/title/company/linkedin_url — those come from join with candidates
  app.post("/api/approvals", async (req: Request, res: Response) => {
    try {
      const {
        candidate_id,
        campaign_id,
        proposed_text,
        context,
        reasoning,
        approval_type,
      } = req.body;

      const result = await db.query(
        `INSERT INTO approval_queue
          (candidate_id, campaign_id, proposed_text, context, reasoning, approval_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [candidate_id, campaign_id, proposed_text, context, reasoning || null, approval_type]
      );

      const approval = result.rows[0];

      // Look up candidate info for the Telegram notification
      const candResult = await db.query(
        `SELECT name, title, company, linkedin_url FROM candidates WHERE id = $1`,
        [candidate_id]
      );
      const cand = candResult.rows[0];

      // Send Telegram notification
      try {
        await sendApprovalNotification({
          id: approval.id,
          candidate_name: cand?.name || "Unknown",
          candidate_title: cand?.title || "",
          candidate_company: cand?.company || "",
          linkedin_url: cand?.linkedin_url || "",
          proposed_text,
          context: context || reasoning || "",
          approval_type,
        });
      } catch (notifyErr) {
        console.error("Failed to send Telegram notification:", notifyErr);
      }

      res.status(201).json(approval);
    } catch (error) {
      console.error("POST /api/approvals error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/actions - log an agent action
  // Live schema: agent_actions has details (jsonb) not metadata
  app.post("/api/actions", async (req: Request, res: Response) => {
    try {
      const { candidate_id, campaign_id, action_type, success, error_message, metadata, details } =
        req.body;

      const result = await db.query(
        `INSERT INTO agent_actions (candidate_id, campaign_id, action_type, success, error_message, details)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [candidate_id, campaign_id, action_type, success ?? true, error_message || null, details || metadata || null]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("POST /api/actions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/rate-limits?action= - check today's action count vs settings limits
  app.get("/api/rate-limits", async (req: Request, res: Response) => {
    try {
      const action = req.query.action as string;

      if (!action) {
        res.status(400).json({ error: "action query parameter required" });
        return;
      }

      const today = new Date().toISOString().split("T")[0];

      const countResult = await db.query(
        `SELECT COUNT(*) as count FROM agent_actions
         WHERE action_type = $1 AND DATE(created_at) = $2 AND success = true`,
        [action, today]
      );
      const todayCount = parseInt(countResult.rows[0].count, 10);

      const settingsResult = await db.query(
        `SELECT value FROM settings WHERE key = 'global_rate_limits'`
      );

      let limit = 20;
      if (settingsResult.rows.length > 0) {
        const limits = settingsResult.rows[0].value;
        if (action === "connection_request") {
          limit = limits.daily_connection_requests || 15;
        } else if (action === "message_sent" || action === "message") {
          limit = limits.daily_messages || 20;
        }
      }

      res.json({
        action,
        today_count: todayCount,
        limit,
        allowed: todayCount < limit,
        remaining: Math.max(0, limit - todayCount),
      });
    } catch (error) {
      console.error("GET /api/rate-limits error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/settings - flatten all settings into a single object
  app.get("/api/settings", async (_req: Request, res: Response) => {
    try {
      const result = await db.query(`SELECT key, value FROM settings`);

      const settings: Record<string, any> = {};
      for (const row of result.rows) {
        if (typeof row.value === "object" && row.value !== null) {
          Object.assign(settings, row.value);
        } else {
          settings[row.key] = row.value;
        }
      }

      res.json(settings);
    } catch (error) {
      console.error("GET /api/settings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/candidates/:id - single candidate
  app.get("/api/candidates/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await db.query(`SELECT * FROM candidates WHERE id = $1`, [id]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Candidate not found" });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("GET /api/candidates/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/candidates - insert new candidate
  // Live schema: candidates has linkedin_profile_id (not linkedin_id), summary, match_score
  // Does NOT have profile_data
  app.post("/api/candidates", async (req: Request, res: Response) => {
    try {
      const { campaign_id, linkedin_profile_id, name: rawName, title: rawTitle, company: rawCompany, location: rawLocation, linkedin_url, summary, match_score } =
        req.body;

      // Truncate varchar fields to fit DB column limits (varchar 255)
      const name = (rawName || "").slice(0, 255);
      const title = (rawTitle || "").slice(0, 255);
      const company = (rawCompany || "").slice(0, 255);
      const location = (rawLocation || "").slice(0, 255);

      const result = await db.query(
        `INSERT INTO candidates (campaign_id, linkedin_profile_id, name, title, company, location, linkedin_url, summary, match_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (linkedin_url) DO NOTHING
         RETURNING *`,
        [campaign_id, linkedin_profile_id || null, name, title || null, company || null, location || null, linkedin_url, summary || null, match_score || null]
      );

      if (result.rows.length === 0) {
        const existing = await db.query(
          `SELECT * FROM candidates WHERE linkedin_url = $1`,
          [linkedin_url]
        );
        res.status(200).json({ ...existing.rows[0], already_exists: true });
        return;
      }

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("POST /api/candidates error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/campaigns/active - active campaigns
  app.get("/api/campaigns/active", async (_req: Request, res: Response) => {
    try {
      const result = await db.query(
        `SELECT * FROM campaigns WHERE status = 'active' ORDER BY priority DESC, created_at ASC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/campaigns/active error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return app;
}
