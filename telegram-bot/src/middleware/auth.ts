import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Pool } from "pg";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ACCESS_TOKEN_EXPIRY = "30m";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface JwtPayload {
  userId: string;
  email: string;
  role: "admin" | "user";
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// --- Token helpers ---

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d`,
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function storeRefreshToken(
  db: Pool,
  userId: string,
  token: string
): Promise<void> {
  const hash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt]
  );
}

export async function revokeRefreshToken(
  db: Pool,
  token: string
): Promise<void> {
  const hash = hashToken(token);
  await db.query(
    `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`,
    [hash]
  );
}

export async function isRefreshTokenValid(
  db: Pool,
  token: string
): Promise<boolean> {
  const hash = hashToken(token);
  const result = await db.query(
    `SELECT id FROM refresh_tokens
     WHERE token_hash = $1 AND revoked = false AND expires_at > NOW()`,
    [hash]
  );
  return result.rows.length > 0;
}

// --- Middleware ---

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  try {
    const token = header.slice(7);
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
