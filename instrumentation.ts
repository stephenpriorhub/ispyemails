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

        console.log(`[iSpyFinpub] Applying migration: ${dir}`);
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

        console.log(`[iSpyFinpub] ✓ ${dir}`);
      }

      console.log("[iSpyFinpub] Migrations complete.");
    }
  } catch (err) {
    console.error("[iSpyFinpub] Migration error:", err);
  }

  const EMAIL_SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;  // 3 hours
  const BRAIN_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;  // 6 hours
  const BRAIN_SYNC_OFFSET_MS   = 30 * 60 * 1000;      // 30-min offset from email sync
  const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  async function runSync() {
    try {
      const res = await fetch(`${BASE_URL}/api/sync`);
      const data = await res.json();
      const results = data.results ?? [];
      const totalNew = results.reduce((sum: number, r: { newEmails?: number }) => sum + (r.newEmails ?? 0), 0);
      if (totalNew > 0) console.log(`[iSpyFinpub] Auto-sync: ${totalNew} new email(s)`);
    } catch (err) {
      console.error("[iSpyFinpub] Auto-sync failed:", err);
    }
  }

  async function runBrainSync() {
    try {
      const res = await fetch(`${BASE_URL}/api/cron/brain-sync`);
      const data = await res.json() as { pushed?: number; errors?: string[] };
      if (data.pushed && data.pushed > 0) {
        console.log(`[iSpyFinpub] Brain-sync: pushed ${data.pushed} learning(s) to vault`);
      } else if (data.errors?.length) {
        console.error(`[iSpyFinpub] Brain-sync error: ${data.errors[0]}`);
      }
    } catch (err) {
      console.error("[iSpyFinpub] Brain-sync failed:", err);
    }
  }

  // Email sync — start after 10s, then every 3 hours
  setTimeout(() => {
    runSync();
    setInterval(runSync, EMAIL_SYNC_INTERVAL_MS);
    console.log("[iSpyFinpub] Auto-sync started — every 3 hours");
  }, 10_000);

  // Brain sync — start after 30.5 minutes (offset from email sync), then every 6 hours
  setTimeout(() => {
    runBrainSync();
    setInterval(runBrainSync, BRAIN_SYNC_INTERVAL_MS);
    console.log("[iSpyFinpub] Brain-sync started — every 6 hours");
  }, BRAIN_SYNC_OFFSET_MS + 30_000);
}
