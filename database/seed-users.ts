/**
 * Seed script: creates initial admin users (Nick + Corwin),
 * assigns them to all existing campaigns, and backfills user_id
 * on existing records.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx database/seed-users.ts
 *
 * Requires: bcryptjs (installed in telegram-bot workspace)
 */

import { Pool } from "pg";
import bcrypt from "bcryptjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const db = new Pool({ connectionString: DATABASE_URL });

interface SeedUser {
  email: string;
  password: string;
  name: string;
  role: "admin" | "user";
}

const SEED_USERS: SeedUser[] = [
  {
    email: "nick@culturetocash.com",
    name: "Nick",
    password: process.env.NICK_PASSWORD || "changeme123",
    role: "admin",
  },
  {
    email: "corwin@culturetocash.com",
    name: "Corwin",
    password: process.env.CORWIN_PASSWORD || "changeme123",
    role: "admin",
  },
];

async function seed() {
  console.log("🌱 Seeding users...\n");

  const userIds: string[] = [];

  for (const user of SEED_USERS) {
    const hash = await bcrypt.hash(user.password, 12);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         role = EXCLUDED.role
       RETURNING id, email, name, role`,
      [user.email, hash, user.name, user.role]
    );

    const created = result.rows[0];
    userIds.push(created.id);
    console.log(`  ✅ ${created.name} (${created.email}) — role: ${created.role}, id: ${created.id}`);
  }

  // Assign all users to all existing campaigns
  const campaigns = await db.query(`SELECT id, title FROM campaigns`);

  if (campaigns.rows.length > 0) {
    console.log(`\n📋 Assigning users to ${campaigns.rows.length} campaign(s)...`);

    for (const userId of userIds) {
      for (const campaign of campaigns.rows) {
        await db.query(
          `INSERT INTO user_campaign_assignments (user_id, campaign_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, campaign_id) DO NOTHING`,
          [userId, campaign.id]
        );
      }
    }
    console.log("  ✅ All users assigned to all campaigns");
  }

  // Backfill user_id on existing records (use first admin as default owner)
  const defaultUserId = userIds[0];

  if (defaultUserId) {
    console.log(`\n🔄 Backfilling user_id on existing records (default: ${SEED_USERS[0].name})...`);

    const updates = [
      { table: "approval_queue", column: "user_id" },
      { table: "agent_actions", column: "user_id" },
      { table: "candidates", column: "user_scraped_by" },
    ];

    for (const { table, column } of updates) {
      const result = await db.query(
        `UPDATE ${table} SET ${column} = $1 WHERE ${column} IS NULL`,
        [defaultUserId]
      );
      console.log(`  ✅ ${table}.${column}: ${result.rowCount} rows updated`);
    }

    // Set created_by_user_id on campaigns
    const campResult = await db.query(
      `UPDATE campaigns SET created_by_user_id = $1 WHERE created_by_user_id IS NULL`,
      [defaultUserId]
    );
    console.log(`  ✅ campaigns.created_by_user_id: ${campResult.rowCount} rows updated`);
  }

  console.log("\n✅ Seed complete!");
  await db.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
