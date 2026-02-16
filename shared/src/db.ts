import { Pool } from "pg";

let pool: Pool | null = null;

export function initDatabase(connectionString: string): Pool {
  if (pool) {
    return pool;
  }

  pool = new Pool({ connectionString });

  pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
  });

  return pool;
}

export function getDatabase(): Pool {
  if (!pool) {
    throw new Error("Database not initialized. Call initDatabase first.");
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Helper function to check database connection
export async function testConnection(): Promise<boolean> {
  try {
    const db = getDatabase();
    const result = await db.query("SELECT NOW()");
    console.log("✅ Database connected:", result.rows[0].now);
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
}
