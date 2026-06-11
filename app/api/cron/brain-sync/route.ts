import { NextResponse } from "next/server";
import { exportLearningsToBrain } from "@/lib/brain-export";

const AGENT_LOG_URL = "https://oxfordhub.app/api/agent-log";
const AGENT_NAME = "iSpy Brain Agent";

async function logToAgentOps(action: string, detail: string, sessionId: string) {
  try {
    await fetch(AGENT_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: AGENT_NAME, action, detail, sessionId }),
    });
  } catch {
    // Non-critical — log failure shouldn't stop the sync
  }
}

// GET — called by the instrumentation.ts scheduler every 6 hours
export async function GET() {
  const sessionId = new Date().toISOString().slice(0, 13).replace("T", "-"); // e.g. "2026-06-11-14"

  const result = await exportLearningsToBrain();

  const detail = result.pushed > 0
    ? `Pushed ${result.pushed} learnings to brain vault`
    : result.errors.length > 0
      ? `Sync failed: ${result.errors[0]}`
      : "No new learnings to push";

  await logToAgentOps("Nightly brain sync", detail, sessionId);

  if (result.errors.length > 0 && result.pushed === 0) {
    console.error(`[BrainSync] ${detail}`);
    return NextResponse.json({ ok: false, ...result }, { status: 500 });
  }

  console.log(`[BrainSync] ${detail}`);
  return NextResponse.json({ ok: true, ...result });
}
