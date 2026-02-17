/**
 * CLI script to create a user.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx telegram-bot/src/scripts/create-user.ts \
 *     --email nick@culturetocash.com \
 *     --name Nick \
 *     --password 'mypassword' \
 *     --role admin
 */

import { Pool } from "pg";
import bcrypt from "bcryptjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL env var required");
  process.exit(1);
}

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const email = getArg("--email");
  const name = getArg("--name");
  const password = getArg("--password");
  const role = getArg("--role") || "user";

  if (!email || !name || !password) {
    console.error("Usage: --email <email> --name <name> --password <password> [--role admin|user]");
    process.exit(1);
  }

  const db = new Pool({ connectionString: DATABASE_URL });

  const hash = await bcrypt.hash(password, 12);

  const result = await db.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, role = EXCLUDED.role
     RETURNING id, email, name, role`,
    [email.toLowerCase(), hash, name, role]
  );

  console.log("User created:", result.rows[0]);
  await db.end();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
