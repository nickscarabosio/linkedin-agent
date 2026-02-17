/**
 * CLI script to encrypt and store LinkedIn credentials for a user.
 *
 * Usage:
 *   DATABASE_URL=postgres://... ENCRYPTION_KEY=<64-hex> npx tsx telegram-bot/src/scripts/set-linkedin-credentials.ts \
 *     --email nick@culturetocash.com \
 *     --linkedin-email nick@example.com \
 *     --linkedin-password 'myLinkedInPass'
 */

import { Pool } from "pg";
import { encrypt } from "../services/encryption";

const DATABASE_URL = process.env.DATABASE_URL;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!DATABASE_URL) {
  console.error("DATABASE_URL env var required");
  process.exit(1);
}
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  console.error("ENCRYPTION_KEY env var required (64-char hex = 32 bytes)");
  process.exit(1);
}

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const email = getArg("--email");
  const linkedinEmail = getArg("--linkedin-email");
  const linkedinPassword = getArg("--linkedin-password");

  if (!email || !linkedinEmail || !linkedinPassword) {
    console.error("Usage: --email <user-email> --linkedin-email <li-email> --linkedin-password <li-pass>");
    process.exit(1);
  }

  const db = new Pool({ connectionString: DATABASE_URL });

  // Look up user
  const userResult = await db.query(`SELECT id, name FROM users WHERE email = $1`, [email.toLowerCase()]);
  if (userResult.rows.length === 0) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const user = userResult.rows[0];

  // Encrypt credentials
  const plaintext = JSON.stringify({ username: linkedinEmail, password: linkedinPassword });
  const { encrypted, iv, authTag } = encrypt(plaintext, ENCRYPTION_KEY!);

  await db.query(
    `INSERT INTO user_linkedin_credentials (user_id, linkedin_email, encrypted_credentials, encryption_iv, encryption_auth_tag)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       linkedin_email = EXCLUDED.linkedin_email,
       encrypted_credentials = EXCLUDED.encrypted_credentials,
       encryption_iv = EXCLUDED.encryption_iv,
       encryption_auth_tag = EXCLUDED.encryption_auth_tag,
       updated_at = NOW()`,
    [user.id, linkedinEmail, encrypted, iv, authTag]
  );

  console.log(`LinkedIn credentials stored for ${user.name} (${email})`);
  await db.end();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
