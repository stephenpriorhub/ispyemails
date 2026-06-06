export async function register() {
  // Only run in Node.js server runtime (not edge, not build time)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test") return;

  // Run migrations by executing SQL files directly via Prisma client.
  // (Prisma 7 CLI can't read datasource URL from env in Docker — bypass it.)
  try {
    const { prisma } = await import("@/lib/prisma");
    const fs = await import("fs");
    const path = await import("path");

    const migrationsDir = path.join(process.cwd(), "prisma/migrations");

    if (fs.existsSync(migrationsDir)) {
      // Ensure migrations tracking table exists
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
          id VARCHAR(36) PRIMARY KEY,
          checksum VARCHAR(64) NOT NULL,
          finished_at TIMESTAMPTZ,
          migration_name VARCHAR(255) NOT NULL,
          logs TEXT,
          rolled_back_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        )
      `);

      const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
      `;
      const appliedSet = new Set(applied.map((r) => r.migration_name));

      const dirs = fs.readdirSync(migrationsDir)
        .filter((d) => d !== "migration_lock.toml" && fs.statSync(path.join(migrationsDir, d)).isDirectory())
        .sort();

      for (const dir of dirs) {
        if (appliedSet.has(dir)) continue;

        const sqlFile = path.join(migrationsDir, dir, "migration.sql");
        if (!fs.existsSync(sqlFile)) continue;

        console.log(`[iSpyEmails] Applying migration: ${dir}`);
        const sql = fs.readFileSync(sqlFile, "utf-8");

        // Split on semicolons, run each statement
        const statements = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
        for (const stmt of statements) {
          await prisma.$executeRawUnsafe(stmt);
        }

        await prisma.$executeRawUnsafe(`
          INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
          VALUES (gen_random_uuid()::text, 'manual', NOW(), $1, 1)
        `, dir);

        console.log(`[iSpyEmails] ✓ ${dir}`);
      }

      console.log("[iSpyEmails] Migrations complete.");
    }
  } catch (err) {
    console.error("[iSpyEmails] Migration error:", err);
  }

  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  async function runSync() {
    try {
      const res = await fetch(`${BASE_URL}/api/sync`);
      const data = await res.json();
      const results = data.results ?? [];
      const totalNew = results.reduce((sum: number, r: { newEmails?: number }) => sum + (r.newEmails ?? 0), 0);
      if (totalNew > 0) console.log(`[iSpyEmails] Auto-sync: ${totalNew} new email(s)`);
    } catch (err) {
      console.error("[iSpyEmails] Auto-sync failed:", err);
    }
  }

  // Wait for server to be ready before first sync
  setTimeout(() => {
    runSync();
    setInterval(runSync, INTERVAL_MS);
    console.log(`[iSpyEmails] Auto-sync started — every 15 minutes`);
  }, 10_000);
}
