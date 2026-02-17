import express, { Request, Response } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { sendApprovalNotification } from "./telegram-notifier";
import {
  requireAuth,
  requireAdmin,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  storeRefreshToken,
  revokeRefreshToken,
  isRefreshTokenValid,
  hashToken,
  JwtPayload,
} from "./middleware/auth";
import { encrypt, decrypt } from "./services/encryption";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export function createApiServer(db: Pool) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // ============================================================
  // AUTH ENDPOINTS (unauthenticated)
  // ============================================================

  // POST /api/auth/login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: "email and password required" });
        return;
      }

      const result = await db.query(
        `SELECT id, email, password_hash, name, role, is_active FROM users WHERE email = $1`,
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const user = result.rows[0];

      if (!user.is_active) {
        res.status(401).json({ error: "Account is deactivated" });
        return;
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const payload: JwtPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);

      await storeRefreshToken(db, user.id, refreshToken);

      // Audit log
      await db.query(
        `INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)`,
        [user.id, "login", JSON.stringify({ email: user.email })]
      );

      res.json({
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (error) {
      console.error("POST /api/auth/login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/refresh
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res.status(400).json({ error: "refreshToken required" });
        return;
      }

      const valid = await isRefreshTokenValid(db, refreshToken);
      if (!valid) {
        res.status(401).json({ error: "Invalid or expired refresh token" });
        return;
      }

      let payload: JwtPayload;
      try {
        payload = verifyToken(refreshToken);
      } catch {
        res.status(401).json({ error: "Invalid refresh token" });
        return;
      }

      // Revoke old, issue new pair
      await revokeRefreshToken(db, refreshToken);

      const newPayload: JwtPayload = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
      };

      const newAccessToken = signAccessToken(newPayload);
      const newRefreshToken = signRefreshToken(newPayload);
      await storeRefreshToken(db, payload.userId, newRefreshToken);

      res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    } catch (error) {
      console.error("POST /api/auth/refresh error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await revokeRefreshToken(db, refreshToken);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("POST /api/auth/logout error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================
  // ALL ROUTES BELOW REQUIRE AUTH
  // ============================================================
  app.use("/api/me", requireAuth);
  app.use("/api/approvals", requireAuth);
  app.use("/api/candidates", requireAuth);
  app.use("/api/notes", requireAuth);
  app.use("/api/campaigns", requireAuth);
  app.use("/api/actions", requireAuth);
  app.use("/api/rate-limits", requireAuth);
  app.use("/api/settings", requireAuth);
  app.use("/api/templates", requireAuth);
  app.use("/api/admin", requireAuth, requireAdmin);
  app.use("/api/ai", requireAuth);
  app.use("/api/pipelines", requireAuth);

  // ============================================================
  // AI ENDPOINTS
  // ============================================================

  // POST /api/ai/parse-jd — extract structured data from a job description
  app.post("/api/ai/parse-jd", upload.single("file"), async (req: Request, res: Response) => {
    try {
      let text = "";

      if (req.file) {
        const mime = req.file.mimetype;
        const ext = req.file.originalname.split(".").pop()?.toLowerCase();

        if (mime === "application/pdf" || ext === "pdf") {
          const parsed = await pdfParse(req.file.buffer);
          text = parsed.text;
        } else if (
          mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          ext === "docx"
        ) {
          const result = await mammoth.extractRawText({ buffer: req.file.buffer });
          text = result.value;
        } else if (mime === "text/plain" || ext === "txt") {
          text = req.file.buffer.toString("utf-8");
        } else {
          res.status(400).json({ error: "Unsupported file type. Use PDF, DOCX, or TXT." });
          return;
        }
      } else if (req.body?.text) {
        text = req.body.text;
      } else {
        res.status(400).json({ error: "Provide a file upload or { text } in the body" });
        return;
      }

      // Cap at 8000 chars
      text = text.slice(0, 8000).trim();
      if (!text) {
        res.status(400).json({ error: "Could not extract any text from the provided input" });
        return;
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
        return;
      }

      const anthropic = new Anthropic({ apiKey });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Extract the following fields from this job description. Return ONLY valid JSON with these keys:
- "title": a short campaign title (e.g. "Senior Backend Engineer - Acme")
- "role_title": the job title
- "role_description": a concise summary of the role (2-4 sentences)
- "ideal_candidate_profile": what the ideal candidate looks like (skills, experience, traits)
- "linkedin_search_url": a LinkedIn People Search URL to find candidates matching this role. Build it using https://www.linkedin.com/search/results/people/?keywords=KEYWORDS&origin=GLOBAL_SEARCH_HEADER where KEYWORDS are URL-encoded search terms combining the role title and 2-3 key skills. Focus on terms a candidate would have in their profile headline or title. For example, for a Senior React Engineer role needing TypeScript and Node.js, use keywords like "Senior React Engineer TypeScript". Keep it focused — 3-5 keywords max.

If a field is not clearly present, use an empty string.

Job Description:
${text}`,
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== "text") {
        res.status(500).json({ error: "Unexpected AI response format" });
        return;
      }

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content.text.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);
      res.json({
        title: parsed.title || "",
        role_title: parsed.role_title || "",
        role_description: parsed.role_description || "",
        ideal_candidate_profile: parsed.ideal_candidate_profile || "",
        linkedin_search_url: parsed.linkedin_search_url || "",
      });
    } catch (error) {
      console.error("POST /api/ai/parse-jd error:", error);
      res.status(500).json({ error: "Failed to parse job description" });
    }
  });

  // POST /api/ai/generate-search-url — generate LinkedIn search URL from campaign fields
  app.post("/api/ai/generate-search-url", async (req: Request, res: Response) => {
    try {
      const { role_title, role_description, ideal_candidate_profile } = req.body;

      if (!role_title) {
        res.status(400).json({ error: "role_title is required" });
        return;
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
        return;
      }

      const anthropic = new Anthropic({ apiKey });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: `Generate a LinkedIn People Search URL to find candidates for this role. Return ONLY the URL, nothing else.

Build it using: https://www.linkedin.com/search/results/people/?keywords=KEYWORDS&origin=GLOBAL_SEARCH_HEADER
where KEYWORDS are URL-encoded search terms (3-5 keywords max) combining the role title and key skills a candidate would have in their headline.

Role Title: ${role_title}
${role_description ? `Role Description: ${role_description}` : ""}
${ideal_candidate_profile ? `Ideal Candidate: ${ideal_candidate_profile}` : ""}`,
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== "text") {
        res.status(500).json({ error: "Unexpected AI response format" });
        return;
      }

      // Extract URL from response
      const urlMatch = content.text.trim().match(/https:\/\/www\.linkedin\.com\/search\/results\/people\/[^\s"'<>]+/);
      const url = urlMatch ? urlMatch[0] : content.text.trim();

      res.json({ linkedin_search_url: url });
    } catch (error) {
      console.error("POST /api/ai/generate-search-url error:", error);
      res.status(500).json({ error: "Failed to generate search URL" });
    }
  });

  // ============================================================
  // USER PROFILE ENDPOINTS
  // ============================================================

  // GET /api/me
  app.get("/api/me", async (req: Request, res: Response) => {
    try {
      const result = await db.query(
        `SELECT id, email, name, role, telegram_chat_id, is_active, created_at FROM users WHERE id = $1`,
        [req.user!.userId]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("GET /api/me error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/me/password
  app.patch("/api/me/password", async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: "currentPassword and newPassword required" });
        return;
      }

      const result = await db.query(
        `SELECT password_hash FROM users WHERE id = $1`,
        [req.user!.userId]
      );
      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!valid) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }

      const hash = await bcrypt.hash(newPassword, 12);
      await db.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [hash, req.user!.userId]
      );

      await db.query(
        `INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)`,
        [req.user!.userId, "password_changed"]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("PATCH /api/me/password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/me/linkedin-credentials — return encrypted creds for Electron to decrypt
  app.get("/api/me/linkedin-credentials", async (req: Request, res: Response) => {
    try {
      const result = await db.query(
        `SELECT linkedin_email, encrypted_credentials, encryption_iv, encryption_auth_tag
         FROM user_linkedin_credentials WHERE user_id = $1`,
        [req.user!.userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "No LinkedIn credentials stored" });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("GET /api/me/linkedin-credentials error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/me/linkedin-credentials — encrypt and store creds
  app.put("/api/me/linkedin-credentials", async (req: Request, res: Response) => {
    try {
      const { linkedin_email, linkedin_password } = req.body;
      if (!linkedin_email || !linkedin_password) {
        res.status(400).json({ error: "linkedin_email and linkedin_password required" });
        return;
      }

      if (!ENCRYPTION_KEY) {
        res.status(500).json({ error: "ENCRYPTION_KEY not configured on server" });
        return;
      }

      const plaintext = JSON.stringify({ username: linkedin_email, password: linkedin_password });
      const { encrypted, iv, authTag } = encrypt(plaintext, ENCRYPTION_KEY);

      await db.query(
        `INSERT INTO user_linkedin_credentials (user_id, linkedin_email, encrypted_credentials, encryption_iv, encryption_auth_tag)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           linkedin_email = EXCLUDED.linkedin_email,
           encrypted_credentials = EXCLUDED.encrypted_credentials,
           encryption_iv = EXCLUDED.encryption_iv,
           encryption_auth_tag = EXCLUDED.encryption_auth_tag,
           updated_at = NOW()`,
        [req.user!.userId, linkedin_email, encrypted, iv, authTag]
      );

      await db.query(
        `INSERT INTO audit_logs (user_id, action) VALUES ($1, $2)`,
        [req.user!.userId, "linkedin_credentials_updated"]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("PUT /api/me/linkedin-credentials error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/me/telegram-link-code — generate a 6-char code for /link
  app.post("/api/me/telegram-link-code", async (req: Request, res: Response) => {
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      await db.query(
        `UPDATE users SET telegram_link_code = $1, telegram_link_code_expires_at = $2, updated_at = NOW()
         WHERE id = $3`,
        [code, expiresAt, req.user!.userId]
      );

      res.json({ code, expiresAt });
    } catch (error) {
      console.error("POST /api/me/telegram-link-code error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================
  // APPROVALS
  // ============================================================

  // GET /api/approvals/pending - approved messages ready to send (scoped by user)
  app.get("/api/approvals/pending", async (req: Request, res: Response) => {
    try {
      const isAdmin = req.user!.role === "admin";

      let query: string;
      let params: any[];

      if (isAdmin) {
        query = `SELECT aq.*, c.name AS candidate_name, c.title AS candidate_title,
                        c.company AS candidate_company, c.linkedin_url
                 FROM approval_queue aq
                 JOIN candidates c ON aq.candidate_id = c.id
                 WHERE aq.status = 'approved'
                 ORDER BY aq.created_at ASC`;
        params = [];
      } else {
        query = `SELECT aq.*, c.name AS candidate_name, c.title AS candidate_title,
                        c.company AS candidate_company, c.linkedin_url
                 FROM approval_queue aq
                 JOIN candidates c ON aq.candidate_id = c.id
                 WHERE aq.status = 'approved' AND aq.user_id = $1
                 ORDER BY aq.created_at ASC`;
        params = [req.user!.userId];
      }

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/approvals/pending error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/approvals — all approvals for user (or all for admin)
  app.get("/api/approvals", async (req: Request, res: Response) => {
    try {
      const isAdmin = req.user!.role === "admin";
      const status = req.query.status as string | undefined;

      let query = `SELECT aq.*, c.name AS candidate_name, c.title AS candidate_title,
                          c.company AS candidate_company, c.linkedin_url
                   FROM approval_queue aq
                   JOIN candidates c ON aq.candidate_id = c.id
                   WHERE 1=1`;
      const params: any[] = [];
      let idx = 1;

      if (!isAdmin) {
        query += ` AND aq.user_id = $${idx++}`;
        params.push(req.user!.userId);
      }

      if (status) {
        query += ` AND aq.status = $${idx++}`;
        params.push(status);
      }

      query += ` ORDER BY aq.created_at DESC LIMIT 100`;

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/approvals error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/approvals/:id - update approval status
  app.patch("/api/approvals/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, sent_at, failed_reason, approved_text } = req.body;

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (status) {
        setClauses.push(`status = $${idx++}`);
        values.push(status);

        if (status === "approved") {
          setClauses.push(`responded_at = NOW()`);
          setClauses.push(`approved_by_user_id = $${idx++}`);
          values.push(req.user!.userId);
        }
      }
      if (sent_at) {
        setClauses.push(`sent_at = $${idx++}`);
        values.push(sent_at);
      }
      if (failed_reason !== undefined) {
        setClauses.push(`failed_reason = $${idx++}`);
        values.push(failed_reason);
      }
      if (approved_text !== undefined) {
        setClauses.push(`approved_text = $${idx++}`);
        values.push(approved_text);
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

  // POST /api/approvals/batch - batch approve/reject
  app.post("/api/approvals/batch", async (req: Request, res: Response) => {
    try {
      const { ids, status } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "ids must be a non-empty array" });
        return;
      }

      if (status !== "approved" && status !== "rejected") {
        res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
        return;
      }

      let result;
      if (status === "approved") {
        result = await db.query(
          `UPDATE approval_queue SET status = $1, responded_at = NOW(), approved_by_user_id = $2
           WHERE id = ANY($3) AND status = 'pending' RETURNING *`,
          [status, req.user!.userId, ids]
        );
      } else {
        result = await db.query(
          `UPDATE approval_queue SET status = $1
           WHERE id = ANY($2) AND status = 'pending' RETURNING *`,
          [status, ids]
        );
      }

      res.json({ updated: result.rows.length });
    } catch (error) {
      console.error("POST /api/approvals/batch error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/approvals - create approval + send Telegram notification
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
          (candidate_id, campaign_id, proposed_text, context, reasoning, approval_type, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [candidate_id, campaign_id, proposed_text, context, reasoning || null, approval_type, req.user!.userId]
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
          campaign_id,
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

  // ============================================================
  // CANDIDATES
  // ============================================================

  // GET /api/candidates/qualified - scoped by user's assigned campaigns
  app.get("/api/candidates/qualified", async (req: Request, res: Response) => {
    try {
      const isAdmin = req.user!.role === "admin";

      let query: string;
      let params: any[];

      if (isAdmin) {
        query = `SELECT c.* FROM candidates c
                 JOIN campaigns camp ON c.campaign_id = camp.id AND camp.status = 'active'
                 WHERE c.status = 'new'
                   AND NOT EXISTS (
                     SELECT 1 FROM approval_queue aq WHERE aq.candidate_id = c.id
                   )
                 ORDER BY c.created_at ASC`;
        params = [];
      } else {
        query = `SELECT c.* FROM candidates c
                 JOIN campaigns camp ON c.campaign_id = camp.id AND camp.status = 'active'
                 JOIN user_campaign_assignments uca ON uca.campaign_id = camp.id AND uca.user_id = $1
                 WHERE c.status = 'new'
                   AND NOT EXISTS (
                     SELECT 1 FROM approval_queue aq WHERE aq.candidate_id = c.id
                   )
                 ORDER BY c.created_at ASC`;
        params = [req.user!.userId];
      }

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/candidates/qualified error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/candidates — list all candidates (scoped by campaigns)
  app.get("/api/candidates", async (req: Request, res: Response) => {
    try {
      const isAdmin = req.user!.role === "admin";
      const status = req.query.status as string | undefined;
      const campaign_id = req.query.campaign_id as string | undefined;

      let query = `SELECT c.*, camp.title AS campaign_title FROM candidates c
                   JOIN campaigns camp ON c.campaign_id = camp.id`;
      const params: any[] = [];
      let idx = 1;

      if (!isAdmin) {
        query += ` JOIN user_campaign_assignments uca ON uca.campaign_id = camp.id AND uca.user_id = $${idx++}`;
        params.push(req.user!.userId);
      }

      query += ` WHERE 1=1`;

      if (status) {
        query += ` AND c.status = $${idx++}`;
        params.push(status);
      }
      if (campaign_id) {
        query += ` AND c.campaign_id = $${idx++}`;
        params.push(campaign_id);
      }

      query += ` ORDER BY c.created_at DESC LIMIT 200`;

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/candidates error:", error);
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

  // PATCH /api/candidates/:id - update candidate status
  app.patch("/api/candidates/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, contacted_at } = req.body;

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (status) {
        setClauses.push(`status = $${idx++}`);
        values.push(status);
      }
      if (contacted_at) {
        setClauses.push(`contacted_at = $${idx++}`);
        values.push(contacted_at);
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      values.push(id);
      const result = await db.query(
        `UPDATE candidates SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Candidate not found" });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("PATCH /api/candidates/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/candidates - insert new candidate
  app.post("/api/candidates", async (req: Request, res: Response) => {
    try {
      const { campaign_id, linkedin_profile_id, name: rawName, title: rawTitle, company: rawCompany, location: rawLocation, linkedin_url, summary, match_score } =
        req.body;

      const name = (rawName || "").slice(0, 255);
      const title = (rawTitle || "").slice(0, 255);
      const company = (rawCompany || "").slice(0, 255);
      const location = (rawLocation || "").slice(0, 255);

      const result = await db.query(
        `INSERT INTO candidates (campaign_id, linkedin_profile_id, name, title, company, location, linkedin_url, summary, match_score, user_scraped_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (linkedin_url) DO NOTHING
         RETURNING *`,
        [campaign_id, linkedin_profile_id || null, name, title || null, company || null, location || null, linkedin_url, summary || null, match_score || null, req.user!.userId]
      );

      if (result.rows.length === 0) {
        const existing = await db.query(
          `SELECT * FROM candidates WHERE linkedin_url = $1`,
          [linkedin_url]
        );
        res.status(200).json({ ...existing.rows[0], already_exists: true });
        return;
      }

      const candidate = result.rows[0];

      // Initialize pipeline progress if campaign has a pipeline
      if (campaign_id) {
        const campaignResult = await db.query(
          `SELECT pipeline_id FROM campaigns WHERE id = $1`,
          [campaign_id]
        );
        if (campaignResult.rows.length > 0 && campaignResult.rows[0].pipeline_id) {
          const stages = await db.query(
            `SELECT id, stage_order FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY stage_order ASC`,
            [campaignResult.rows[0].pipeline_id]
          );
          for (const stage of stages.rows) {
            await db.query(
              `INSERT INTO candidate_pipeline_progress (candidate_id, pipeline_stage_id, status, started_at)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (candidate_id, pipeline_stage_id) DO NOTHING`,
              [candidate.id, stage.id, stage.stage_order === 1 ? "in_progress" : "pending", stage.stage_order === 1 ? new Date() : null]
            );
          }
        }
      }

      res.status(201).json(candidate);
    } catch (error) {
      console.error("POST /api/candidates error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================
  // CANDIDATE NOTES
  // ============================================================

  // GET /api/candidates/:id/notes — all notes for a candidate, newest first
  app.get("/api/candidates/:id/notes", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await db.query(
        `SELECT * FROM candidate_notes WHERE candidate_id = $1 ORDER BY created_at DESC`,
        [id]
      );
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/candidates/:id/notes error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/candidates/:id/notes — create a note (optionally a reminder)
  app.post("/api/candidates/:id/notes", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { content, remind_at } = req.body;

      if (!content) {
        res.status(400).json({ error: "content is required" });
        return;
      }

      const result = await db.query(
        `INSERT INTO candidate_notes (candidate_id, user_id, content, remind_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, req.user!.userId, content, remind_at || null]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("POST /api/candidates/:id/notes error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/notes/:id — update note content or mark reminder complete
  app.patch("/api/notes/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { content, completed_at } = req.body;

      const setClauses: string[] = ["updated_at = NOW()"];
      const values: any[] = [];
      let idx = 1;

      if (content !== undefined) {
        setClauses.push(`content = $${idx++}`);
        values.push(content);
      }
      if (completed_at !== undefined) {
        setClauses.push(`completed_at = $${idx++}`);
        values.push(completed_at);
      }

      values.push(id);
      const result = await db.query(
        `UPDATE candidate_notes SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Note not found" });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("PATCH /api/notes/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/notes/:id — delete a note
  app.delete("/api/notes/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await db.query(
        `DELETE FROM candidate_notes WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Note not found" });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error("DELETE /api/notes/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================
  // CAMPAIGNS
  // ============================================================

  // GET /api/campaigns/active - scoped by assignments (admins see all)
  app.get("/api/campaigns/active", async (req: Request, res: Response) => {
    try {
      const isAdmin = req.user!.role === "admin";

      let query: string;
      let params: any[];

      if (isAdmin) {
        query = `SELECT * FROM campaigns WHERE status = 'active' ORDER BY priority DESC, created_at ASC`;
        params = [];
      } else {
        query = `SELECT c.* FROM campaigns c
                 JOIN user_campaign_assignments uca ON uca.campaign_id = c.id AND uca.user_id = $1
                 WHERE c.status = 'active'
                 ORDER BY c.priority DESC, c.created_at ASC`;
        params = [req.user!.userId];
      }

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/campaigns/active error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/campaigns — all campaigns
  app.get("/api/campaigns", async (req: Request, res: Response) => {
    try {
      const isAdmin = req.user!.role === "admin";

      let query: string;
      let params: any[];

      if (isAdmin) {
        query = `SELECT * FROM campaigns ORDER BY created_at DESC`;
        params = [];
      } else {
        query = `SELECT c.* FROM campaigns c
                 JOIN user_campaign_assignments uca ON uca.campaign_id = c.id AND uca.user_id = $1
                 ORDER BY c.created_at DESC`;
        params = [req.user!.userId];
      }

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/campaigns error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/campaigns/:id
  app.get("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await db.query(`SELECT * FROM campaigns WHERE id = $1`, [id]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("GET /api/campaigns/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/campaigns/:id — update campaign (status, title, priority)
  app.patch("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, title, priority, linkedin_search_url } = req.body;
      const isAdmin = req.user!.role === "admin";

      // Ownership check: user must be assigned to campaign or be admin
      if (!isAdmin) {
        const assignment = await db.query(
          `SELECT 1 FROM user_campaign_assignments WHERE user_id = $1 AND campaign_id = $2`,
          [req.user!.userId, id]
        );
        if (assignment.rows.length === 0) {
          res.status(403).json({ error: "Not assigned to this campaign" });
          return;
        }
      }

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (status) {
        setClauses.push(`status = $${idx++}`);
        values.push(status);
      }
      if (title) {
        setClauses.push(`title = $${idx++}`);
        values.push(title);
      }
      if (priority !== undefined) {
        setClauses.push(`priority = $${idx++}`);
        values.push(priority);
      }
      if (linkedin_search_url !== undefined) {
        setClauses.push(`linkedin_search_url = $${idx++}`);
        values.push(linkedin_search_url || null);
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      values.push(id);
      const result = await db.query(
        `UPDATE campaigns SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }

      await db.query(
        `INSERT INTO audit_logs (user_id, action, target, details) VALUES ($1, $2, $3, $4)`,
        [req.user!.userId, "campaign_updated", `campaign:${id}`, JSON.stringify({ status, title, priority, linkedin_search_url })]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error("PATCH /api/campaigns/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/campaigns — create campaign
  app.post("/api/campaigns", async (req: Request, res: Response) => {
    try {
      const { title, role_title, role_description, ideal_candidate_profile, linkedin_search_url, priority, pipeline_id } = req.body;

      // If no pipeline_id provided, use the default pipeline
      let resolvedPipelineId = pipeline_id || null;
      if (!resolvedPipelineId) {
        const defaultPipeline = await db.query(
          `SELECT id FROM pipelines WHERE is_default = TRUE LIMIT 1`
        );
        if (defaultPipeline.rows.length > 0) {
          resolvedPipelineId = defaultPipeline.rows[0].id;
        }
      }

      const result = await db.query(
        `INSERT INTO campaigns (title, role_title, role_description, ideal_candidate_profile, linkedin_search_url, priority, pipeline_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [title, role_title, role_description, ideal_candidate_profile || null, linkedin_search_url || null, priority || 1, resolvedPipelineId, req.user!.userId]
      );

      // Auto-assign creator to the campaign
      await db.query(
        `INSERT INTO user_campaign_assignments (user_id, campaign_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.user!.userId, result.rows[0].id]
      );

      await db.query(
        `INSERT INTO audit_logs (user_id, action, target, details) VALUES ($1, $2, $3, $4)`,
        [req.user!.userId, "campaign_created", `campaign:${result.rows[0].id}`, JSON.stringify({ title })]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("POST /api/campaigns error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================
  // PIPELINES (authenticated)
  // ============================================================

  // GET /api/pipelines — list all pipelines with stages
  app.get("/api/pipelines", async (_req: Request, res: Response) => {
    try {
      const pipelines = await db.query(
        `SELECT * FROM pipelines ORDER BY is_default DESC, name ASC`
      );
      const stages = await db.query(
        `SELECT * FROM pipeline_stages ORDER BY pipeline_id, stage_order ASC`
      );

      const stagesByPipeline = new Map<string, any[]>();
      for (const s of stages.rows) {
        if (!stagesByPipeline.has(s.pipeline_id)) stagesByPipeline.set(s.pipeline_id, []);
        stagesByPipeline.get(s.pipeline_id)!.push(s);
      }

      const result = pipelines.rows.map((p: any) => ({
        ...p,
        stages: stagesByPipeline.get(p.id) || [],
      }));

      res.json(result);
    } catch (error) {
      console.error("GET /api/pipelines error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/pipelines/:id — single pipeline with stages
  app.get("/api/pipelines/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const pResult = await db.query(`SELECT * FROM pipelines WHERE id = $1`, [id]);
      if (pResult.rows.length === 0) {
        res.status(404).json({ error: "Pipeline not found" });
        return;
      }

      const sResult = await db.query(
        `SELECT * FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY stage_order ASC`,
        [id]
      );

      res.json({ ...pResult.rows[0], stages: sResult.rows });
    } catch (error) {
      console.error("GET /api/pipelines/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/pipelines — create pipeline with stages (transactional)
  app.post("/api/admin/pipelines", async (req: Request, res: Response) => {
    try {
      const { name, description, is_default, stages } = req.body;
      if (!name || !Array.isArray(stages) || stages.length === 0) {
        res.status(400).json({ error: "name and stages[] are required" });
        return;
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        // If setting as default, unset others
        if (is_default) {
          await client.query(`UPDATE pipelines SET is_default = FALSE WHERE is_default = TRUE`);
        }

        const pResult = await client.query(
          `INSERT INTO pipelines (name, description, is_default, created_by)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [name, description || null, is_default || false, req.user!.userId]
        );
        const pipeline = pResult.rows[0];

        for (let i = 0; i < stages.length; i++) {
          const s = stages[i];
          await client.query(
            `INSERT INTO pipeline_stages (pipeline_id, stage_order, name, action_type, delay_days, requires_approval, template_id, config)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [pipeline.id, i + 1, s.name, s.action_type, s.delay_days || 0, s.requires_approval ?? true, s.template_id || null, JSON.stringify(s.config || {})]
          );
        }

        await client.query(
          `INSERT INTO audit_logs (user_id, action, target, details) VALUES ($1, $2, $3, $4)`,
          [req.user!.userId, "pipeline_created", `pipeline:${pipeline.id}`, JSON.stringify({ name })]
        );

        await client.query("COMMIT");

        // Return full pipeline with stages
        const sResult = await db.query(
          `SELECT * FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY stage_order ASC`,
          [pipeline.id]
        );
        res.status(201).json({ ...pipeline, stages: sResult.rows });
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("POST /api/admin/pipelines error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/admin/pipelines/:id — update pipeline metadata
  app.patch("/api/admin/pipelines/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, is_default } = req.body;

      const setClauses: string[] = ["updated_at = NOW()"];
      const values: any[] = [];
      let idx = 1;

      if (name !== undefined) { setClauses.push(`name = $${idx++}`); values.push(name); }
      if (description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(description); }
      if (is_default !== undefined) {
        if (is_default) {
          await db.query(`UPDATE pipelines SET is_default = FALSE WHERE is_default = TRUE`);
        }
        setClauses.push(`is_default = $${idx++}`);
        values.push(is_default);
      }

      if (values.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      values.push(id);
      const result = await db.query(
        `UPDATE pipelines SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Pipeline not found" });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("PATCH /api/admin/pipelines/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/admin/pipelines/:id/stages — replace all stages
  app.put("/api/admin/pipelines/:id/stages", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { stages } = req.body;

      if (!Array.isArray(stages) || stages.length === 0) {
        res.status(400).json({ error: "stages[] is required" });
        return;
      }

      // Check pipeline exists
      const pResult = await db.query(`SELECT id FROM pipelines WHERE id = $1`, [id]);
      if (pResult.rows.length === 0) {
        res.status(404).json({ error: "Pipeline not found" });
        return;
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        await client.query(`DELETE FROM pipeline_stages WHERE pipeline_id = $1`, [id]);

        for (let i = 0; i < stages.length; i++) {
          const s = stages[i];
          await client.query(
            `INSERT INTO pipeline_stages (pipeline_id, stage_order, name, action_type, delay_days, requires_approval, template_id, config)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, i + 1, s.name, s.action_type, s.delay_days || 0, s.requires_approval ?? true, s.template_id || null, JSON.stringify(s.config || {})]
          );
        }

        await client.query(`UPDATE pipelines SET updated_at = NOW() WHERE id = $1`, [id]);

        await client.query("COMMIT");

        const sResult = await db.query(
          `SELECT * FROM pipeline_stages WHERE pipeline_id = $1 ORDER BY stage_order ASC`,
          [id]
        );
        res.json(sResult.rows);
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("PUT /api/admin/pipelines/:id/stages error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/admin/pipelines/:id — delete pipeline (409 if in use)
  app.delete("/api/admin/pipelines/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const inUse = await db.query(
        `SELECT COUNT(*) as count FROM campaigns WHERE pipeline_id = $1`,
        [id]
      );
      if (parseInt(inUse.rows[0].count) > 0) {
        res.status(409).json({ error: "Pipeline is in use by campaigns and cannot be deleted" });
        return;
      }

      const result = await db.query(
        `DELETE FROM pipelines WHERE id = $1 RETURNING id, name`,
        [id]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: "Pipeline not found" });
        return;
      }

      await db.query(
        `INSERT INTO audit_logs (user_id, action, target, details) VALUES ($1, $2, $3, $4)`,
        [req.user!.userId, "pipeline_deleted", `pipeline:${id}`, JSON.stringify({ name: result.rows[0].name })]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("DELETE /api/admin/pipelines/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/candidates/:id/pipeline-progress — progress for a candidate
  app.get("/api/candidates/:id/pipeline-progress", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await db.query(
        `SELECT cpp.*, ps.name AS stage_name, ps.stage_order, ps.action_type
         FROM candidate_pipeline_progress cpp
         JOIN pipeline_stages ps ON cpp.pipeline_stage_id = ps.id
         WHERE cpp.candidate_id = $1
         ORDER BY ps.stage_order ASC`,
        [id]
      );
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/candidates/:id/pipeline-progress error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/candidates/:id/pipeline-progress/:progressId — update stage status
  app.patch("/api/candidates/:id/pipeline-progress/:progressId", async (req: Request, res: Response) => {
    try {
      const { progressId } = req.params;
      const { status, metadata } = req.body;

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (status) {
        setClauses.push(`status = $${idx++}`);
        values.push(status);
        if (status === "in_progress") {
          setClauses.push(`started_at = COALESCE(started_at, NOW())`);
        } else if (status === "completed" || status === "failed" || status === "skipped") {
          setClauses.push(`completed_at = NOW()`);
        }
      }
      if (metadata !== undefined) {
        setClauses.push(`metadata = $${idx++}`);
        values.push(JSON.stringify(metadata));
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      values.push(progressId);
      const result = await db.query(
        `UPDATE candidate_pipeline_progress SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Progress record not found" });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("PATCH /api/candidates/:id/pipeline-progress/:progressId error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/candidates/:id/advance-pipeline — move candidate to next stage
  app.post("/api/candidates/:id/advance-pipeline", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Find current in_progress stage
      const currentResult = await db.query(
        `SELECT cpp.*, ps.stage_order, ps.pipeline_id
         FROM candidate_pipeline_progress cpp
         JOIN pipeline_stages ps ON cpp.pipeline_stage_id = ps.id
         WHERE cpp.candidate_id = $1 AND cpp.status = 'in_progress'
         ORDER BY ps.stage_order ASC
         LIMIT 1`,
        [id]
      );

      if (currentResult.rows.length === 0) {
        res.status(400).json({ error: "No in_progress stage found for this candidate" });
        return;
      }

      const current = currentResult.rows[0];

      // Complete current stage
      await db.query(
        `UPDATE candidate_pipeline_progress SET status = 'completed', completed_at = NOW()
         WHERE id = $1`,
        [current.id]
      );

      // Find next stage
      const nextResult = await db.query(
        `SELECT cpp.id AS progress_id, ps.name AS stage_name
         FROM candidate_pipeline_progress cpp
         JOIN pipeline_stages ps ON cpp.pipeline_stage_id = ps.id
         WHERE cpp.candidate_id = $1 AND ps.pipeline_id = $2 AND ps.stage_order = $3 AND cpp.status = 'pending'
         LIMIT 1`,
        [id, current.pipeline_id, current.stage_order + 1]
      );

      if (nextResult.rows.length > 0) {
        await db.query(
          `UPDATE candidate_pipeline_progress SET status = 'in_progress', started_at = NOW()
           WHERE id = $1`,
          [nextResult.rows[0].progress_id]
        );
        res.json({ advanced: true, next_stage: nextResult.rows[0].stage_name });
      } else {
        res.json({ advanced: false, message: "Pipeline complete" });
      }
    } catch (error) {
      console.error("POST /api/candidates/:id/advance-pipeline error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================
  // ACTIONS
  // ============================================================

  // POST /api/actions - log an agent action
  app.post("/api/actions", async (req: Request, res: Response) => {
    try {
      const { candidate_id, campaign_id, action_type, success, error_message, metadata, details } =
        req.body;

      const result = await db.query(
        `INSERT INTO agent_actions (candidate_id, campaign_id, action_type, success, error_message, details, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [candidate_id, campaign_id, action_type, success ?? true, error_message || null, details || metadata || null, req.user!.userId]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("POST /api/actions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================
  // RATE LIMITS
  // ============================================================

  // GET /api/rate-limits?action= - check today's action count vs settings limits (scoped by user)
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
         WHERE action_type = $1 AND DATE(created_at) = $2 AND success = true AND user_id = $3`,
        [action, today, req.user!.userId]
      );
      const todayCount = parseInt(countResult.rows[0].count, 10);

      const settingsResult = await db.query(
        `SELECT value FROM settings WHERE key = 'global_rate_limits'`
      );

      let limit = 20;
      if (settingsResult.rows.length > 0) {
        const limits = settingsResult.rows[0].value;
        if (action === "connection_request" || action === "connection_request_sent") {
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

  // ============================================================
  // SETTINGS
  // ============================================================

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

  // ============================================================
  // MESSAGE TEMPLATES (authenticated users)
  // ============================================================

  // GET /api/templates?type= — list templates, optional type filter
  app.get("/api/templates", async (req: Request, res: Response) => {
    try {
      const type = req.query.type as string | undefined;
      let query = `SELECT id, name, type, body, created_by, created_at FROM message_templates`;
      const params: any[] = [];

      if (type) {
        query += ` WHERE type = $1`;
        params.push(type);
      }

      query += ` ORDER BY name ASC`;

      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/templates error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================================
  // ADMIN ENDPOINTS
  // ============================================================

  // GET /api/admin/users — list all users
  app.get("/api/admin/users", async (_req: Request, res: Response) => {
    try {
      const result = await db.query(
        `SELECT id, email, name, role, telegram_chat_id, is_active, created_at, updated_at FROM users ORDER BY created_at ASC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/admin/users error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/users — create user
  app.post("/api/admin/users", async (req: Request, res: Response) => {
    try {
      const { email, password, name, role } = req.body;
      if (!email || !password || !name) {
        res.status(400).json({ error: "email, password, and name required" });
        return;
      }

      const hash = await bcrypt.hash(password, 12);
      const result = await db.query(
        `INSERT INTO users (email, password_hash, name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role, is_active, created_at`,
        [email.toLowerCase(), hash, name, role || "user"]
      );

      await db.query(
        `INSERT INTO audit_logs (user_id, action, target, details) VALUES ($1, $2, $3, $4)`,
        [req.user!.userId, "user_created", `user:${result.rows[0].id}`, JSON.stringify({ email, name, role })]
      );

      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      if (error.code === "23505") {
        res.status(409).json({ error: "Email already exists" });
        return;
      }
      console.error("POST /api/admin/users error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/admin/users/:id — update user
  app.patch("/api/admin/users/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, role, is_active } = req.body;

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (name !== undefined) {
        setClauses.push(`name = $${idx++}`);
        values.push(name);
      }
      if (role !== undefined) {
        setClauses.push(`role = $${idx++}`);
        values.push(role);
      }
      if (is_active !== undefined) {
        setClauses.push(`is_active = $${idx++}`);
        values.push(is_active);
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(id);

      const result = await db.query(
        `UPDATE users SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING id, email, name, role, is_active`,
        values
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("PATCH /api/admin/users/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/audit-log
  app.get("/api/admin/audit-log", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;

      const result = await db.query(
        `SELECT al.*, u.name AS user_name, u.email AS user_email
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         ORDER BY al.created_at DESC
         LIMIT $1`,
        [limit]
      );
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/admin/audit-log error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/stats — dashboard stats
  app.get("/api/admin/stats", async (_req: Request, res: Response) => {
    try {
      const today = new Date().toISOString().split("T")[0];

      const [campaigns, candidates, pendingApprovals, todayActions] = await Promise.all([
        db.query(`SELECT COUNT(*) as count FROM campaigns WHERE status = 'active'`),
        db.query(`SELECT COUNT(*) as count FROM candidates`),
        db.query(`SELECT COUNT(*) as count FROM approval_queue WHERE status = 'pending'`),
        db.query(`SELECT COUNT(*) as count FROM agent_actions WHERE DATE(created_at) = $1 AND success = true`, [today]),
      ]);

      res.json({
        active_campaigns: parseInt(campaigns.rows[0].count),
        total_candidates: parseInt(candidates.rows[0].count),
        pending_approvals: parseInt(pendingApprovals.rows[0].count),
        today_actions: parseInt(todayActions.rows[0].count),
      });
    } catch (error) {
      console.error("GET /api/admin/stats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/admin/settings — update settings (transactional)
  app.put("/api/admin/settings", async (req: Request, res: Response) => {
    try {
      const data = req.body;
      if (!data || typeof data !== "object") {
        res.status(400).json({ error: "Settings object required" });
        return;
      }

      // Split flat settings into DB rows
      const rateLimitKeys = [
        "daily_connection_requests", "daily_messages", "weekly_connection_cap",
        "min_delay_seconds", "max_delay_seconds",
      ];
      const workingHoursKeys = [
        "working_hours_start", "working_hours_end", "timezone", "pause_weekends",
      ];
      const aiKeys = ["model", "temperature", "max_tokens"];
      const connectionKeys = [
        "wait_after_acceptance_hours", "include_note_with_request",
        "max_follow_ups", "follow_up_delay_days",
      ];

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        // Helper to merge incoming keys into existing settings row
        const mergeSettings = async (key: string, allowedKeys: string[]) => {
          const incoming: Record<string, any> = {};
          let hasKeys = false;
          for (const k of allowedKeys) {
            if (k in data) {
              incoming[k] = data[k];
              hasKeys = true;
            }
          }
          if (!hasKeys) return;

          const existing = await client.query(
            `SELECT value FROM settings WHERE key = $1`,
            [key]
          );
          const current = existing.rows.length > 0 ? existing.rows[0].value : {};
          const merged = { ...current, ...incoming };

          await client.query(
            `INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
            [key, JSON.stringify(merged)]
          );
        };

        await mergeSettings("global_rate_limits", [...rateLimitKeys, ...workingHoursKeys]);
        await mergeSettings("ai_settings", aiKeys);
        await mergeSettings("connection_strategy", connectionKeys);

        // Audit log
        await client.query(
          `INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)`,
          [req.user!.userId, "settings_updated", JSON.stringify(data)]
        );

        await client.query("COMMIT");
        res.json({ success: true });
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("PUT /api/admin/settings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/templates — list all with creator name
  app.get("/api/admin/templates", async (_req: Request, res: Response) => {
    try {
      const result = await db.query(
        `SELECT mt.*, u.name AS creator_name
         FROM message_templates mt
         LEFT JOIN users u ON mt.created_by = u.id
         ORDER BY mt.name ASC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error("GET /api/admin/templates error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/templates — create template
  app.post("/api/admin/templates", async (req: Request, res: Response) => {
    try {
      const { name, type, body } = req.body;
      if (!name || !type || !body) {
        res.status(400).json({ error: "name, type, and body are required" });
        return;
      }

      const validTypes = ["connection_request", "message", "follow_up"];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
        return;
      }

      const result = await db.query(
        `INSERT INTO message_templates (name, type, body, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, type, body, req.user!.userId]
      );

      await db.query(
        `INSERT INTO audit_logs (user_id, action, target, details) VALUES ($1, $2, $3, $4)`,
        [req.user!.userId, "template_created", `template:${result.rows[0].id}`, JSON.stringify({ name, type })]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("POST /api/admin/templates error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/admin/templates/:id — update template
  app.patch("/api/admin/templates/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, type, body } = req.body;

      const setClauses: string[] = ["updated_at = NOW()"];
      const values: any[] = [];
      let idx = 1;

      if (name !== undefined) {
        setClauses.push(`name = $${idx++}`);
        values.push(name);
      }
      if (type !== undefined) {
        const validTypes = ["connection_request", "message", "follow_up"];
        if (!validTypes.includes(type)) {
          res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
          return;
        }
        setClauses.push(`type = $${idx++}`);
        values.push(type);
      }
      if (body !== undefined) {
        setClauses.push(`body = $${idx++}`);
        values.push(body);
      }

      if (values.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      values.push(id);
      const result = await db.query(
        `UPDATE message_templates SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      await db.query(
        `INSERT INTO audit_logs (user_id, action, target, details) VALUES ($1, $2, $3, $4)`,
        [req.user!.userId, "template_updated", `template:${id}`, JSON.stringify({ name, type })]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error("PATCH /api/admin/templates/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/admin/templates/:id — delete template
  app.delete("/api/admin/templates/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await db.query(
        `DELETE FROM message_templates WHERE id = $1 RETURNING id, name`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      await db.query(
        `INSERT INTO audit_logs (user_id, action, target, details) VALUES ($1, $2, $3, $4)`,
        [req.user!.userId, "template_deleted", `template:${id}`, JSON.stringify({ name: result.rows[0].name })]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("DELETE /api/admin/templates/:id error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Health check (unauthenticated)
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  return app;
}
