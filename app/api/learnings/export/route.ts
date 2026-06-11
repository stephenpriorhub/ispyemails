import { NextResponse } from "next/server";
import { exportLearningsToBrain, fetchAllValidatedLearnings, groupLearnings } from "@/lib/brain-export";

// GET — returns grouped validated learnings for display in Export tab
export async function GET() {
  const learnings = await fetchAllValidatedLearnings();
  const { byGuru, byPublisher, byList, general } = groupLearnings(learnings);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const blocks: { title: string; entity: string; entityType: string; learningIds: string[]; markdown: string; appended: boolean }[] = [];

  for (const [, { name, items }] of Object.entries(byGuru)) {
    const lines = items.map(l => `- ${l.content}${l.email ? ` *(${new Date(l.email.receivedAt).toLocaleDateString()})* ` : ""}`).join("\n");
    blocks.push({
      title: `Guru: ${name}`, entity: name, entityType: "guru",
      learningIds: items.map(l => l.id),
      appended: items.every(l => l.appendedToBrain),
      markdown: `## iSpyFinpub Intelligence\n*Last synced: ${today}*\n\n${lines}`,
    });
  }
  for (const [, { name, items }] of Object.entries(byPublisher)) {
    blocks.push({
      title: `Publisher: ${name}`, entity: name, entityType: "publisher",
      learningIds: items.map(l => l.id),
      appended: items.every(l => l.appendedToBrain),
      markdown: `## iSpyFinpub Intelligence\n*Last synced: ${today}*\n\n${items.map(l => `- ${l.content}`).join("\n")}`,
    });
  }
  for (const [, { name, items }] of Object.entries(byList)) {
    blocks.push({
      title: `List: ${name}`, entity: name, entityType: "list",
      learningIds: items.map(l => l.id),
      appended: items.every(l => l.appendedToBrain),
      markdown: `## iSpyFinpub Intelligence\n*Last synced: ${today}*\n\n${items.map(l => `- ${l.content}`).join("\n")}`,
    });
  }
  if (general.length > 0) {
    blocks.push({
      title: "General", entity: "General", entityType: "general",
      learningIds: general.map(l => l.id),
      appended: general.every(l => l.appendedToBrain),
      markdown: `## iSpyFinpub Intelligence\n*Last synced: ${today}*\n\n${general.map(l => `- ${l.content}`).join("\n")}`,
    });
  }

  return NextResponse.json({ blocks, total: learnings.length });
}

// POST — push un-pushed eligible learnings to brain vault (manual "Push All to Brain" button)
export async function POST() {
  const result = await exportLearningsToBrain();

  if (result.errors.length > 0 && result.pushed === 0) {
    return NextResponse.json({ error: result.errors[0] }, { status: result.errors[0].includes("HUB_API_TOKEN") ? 500 : 502 });
  }

  return NextResponse.json({
    ok: true,
    message: result.pushed === 0 ? "Nothing to push" : `Pushed ${result.pushed} learnings`,
    pushed: result.pushed,
    skipped: result.skipped,
    errors: result.errors,
    marked: result.pushed,
  });
}
