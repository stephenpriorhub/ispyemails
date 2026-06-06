export async function register() {
  // Only run in Node.js server runtime (not edge, not build time)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test") return;

  // Run Prisma migrations on startup — done here instead of entrypoint.sh
  // because process.env is fully populated in the Next.js runtime.
  if (process.env.DATABASE_URL) {
    try {
      const { execSync } = await import("child_process");
      console.log("[iSpyEmails] Running database migrations...");
      execSync("node node_modules/prisma/build/index.js migrate deploy", {
        stdio: "inherit",
        env: { ...process.env }, // explicitly pass full env to child process
      });
      console.log("[iSpyEmails] Migrations complete.");
    } catch (err) {
      console.error("[iSpyEmails] Migration failed:", err);
    }
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
