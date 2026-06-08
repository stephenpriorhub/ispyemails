import { prisma } from "./prisma";

type LearningCategory = "GURU" | "PUBLISHER" | "LIST" | "TOPIC" | "GENERAL";

/** Significant words for overlap comparison (ignore stopwords) */
const STOPWORDS = new Set(["a","an","the","is","are","was","were","has","have","had","be","been","being","and","or","but","in","on","at","to","for","of","with","by","from","as","this","that","these","those","it","its","he","she","they","we","you","i","his","her","their","our","your","my","will","would","could","should","may","might","can","do","does","did","not","no","so","if","then","about","into","up","out","also"]);

function significantWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w))
  );
}

function wordOverlap(a: string, b: string): number {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (!wa.size || !wb.size) return 0;
  const intersection = [...wa].filter(w => wb.has(w)).length;
  return intersection / Math.min(wa.size, wb.size);
}

const OVERLAP_THRESHOLD = 0.50; // 50% — catches rephrased versions of the same insight

/**
 * Check if this learning is already covered by existing validated knowledge.
 * Returns true if ≥65% word overlap with any validated learning for the same entity.
 */
async function isDuplicate(opts: {
  content: string;
  guruId?: string;
  publisherId?: string;
  listId?: string;
}): Promise<boolean> {
  const where: Record<string, unknown> = { status: "VALIDATED" };
  if (opts.guruId) where.guruId = opts.guruId;
  else if (opts.publisherId) where.publisherId = opts.publisherId;
  else if (opts.listId) where.listId = opts.listId;
  // For GENERAL learnings with no entity, check globally
  else where.category = "GENERAL";

  const existing = await prisma.learning.findMany({ where, select: { content: true } });

  for (const v of existing) {
    if (wordOverlap(opts.content, v.content) >= OVERLAP_THRESHOLD) return true;
    if (opts.content.trim().toLowerCase() === v.content.trim().toLowerCase()) return true;
  }
  return false;
}

/**
 * Check if a new learning contradicts existing validated knowledge.
 * Returns null if no contradiction, or a note explaining the conflict.
 */
async function detectContradiction(opts: {
  content: string;
  guruId?: string;
  publisherId?: string;
  listId?: string;
}): Promise<string | null> {
  const where: Record<string, unknown> = { status: "VALIDATED" };
  if (opts.guruId) where.guruId = opts.guruId;
  else if (opts.publisherId) where.publisherId = opts.publisherId;
  else if (opts.listId) where.listId = opts.listId;
  else return null;

  const existing = await prisma.learning.findMany({ where, select: { content: true } });
  if (!existing.length) return null;

  const newLower = opts.content.toLowerCase();
  const contradictionPairs: [string, string, string][] = [
    ["launched", "shut down", "new launch conflicts with shutdown"],
    ["launched", "closed", "new launch conflicts with closure"],
    ["launched", "discontinued", "new launch conflicts with discontinuation"],
    ["new", "retired", "described as new but previously validated as retired"],
    ["new", "ended", "described as new but previously validated as ended"],
    ["partnered", "split", "partnership conflicts with split/separation"],
    ["partnered", "separated", "partnership conflicts with separation"],
    ["same person", "different person", "identity conflicts with existing validation"],
    ["merged", "split", "merge conflicts with split"],
    ["primary editor", "secondary", "primary editor role conflicts with secondary voice"],
    ["left", "joined", "departure conflicts with join"],
    ["joined", "left", "join conflicts with departure"],
    ["no longer", "still", "negation conflicts with current status"],
  ];

  for (const validated of existing) {
    const valLower = validated.content.toLowerCase();
    for (const [a, b, reason] of contradictionPairs) {
      if (
        (newLower.includes(a) && valLower.includes(b)) ||
        (newLower.includes(b) && valLower.includes(a))
      ) {
        const snippet = validated.content.length > 80
          ? validated.content.substring(0, 80) + "…"
          : validated.content;
        return `${reason.charAt(0).toUpperCase() + reason.slice(1)}. Validated fact: "${snippet}"`;
      }
    }
  }
  return null;
}

export async function logAILearning(opts: {
  content: string;
  category?: LearningCategory;
  emailId?: string;
  guruId?: string;
  publisherId?: string;
  listId?: string;
}) {
  try {
    // Skip if already covered by validated knowledge
    if (await isDuplicate(opts)) return;

    const contradictionNote = await detectContradiction(opts);
    await prisma.learning.create({
      data: {
        content: opts.content,
        source: "AI_EMAIL",
        category: opts.category ?? "GENERAL",
        emailId: opts.emailId,
        guruId: opts.guruId,
        publisherId: opts.publisherId,
        listId: opts.listId,
        isContradicted: contradictionNote !== null,
        contradictionNote: contradictionNote ?? undefined,
      },
    });
  } catch {
    // Non-critical
  }
}

export async function logUserLearning(opts: {
  content: string;
  category?: LearningCategory;
  guruId?: string;
  publisherId?: string;
  listId?: string;
}) {
  try {
    await prisma.learning.create({
      data: {
        content: opts.content,
        source: "USER_ACTION",
        category: opts.category ?? "GENERAL",
        guruId: opts.guruId,
        publisherId: opts.publisherId,
        listId: opts.listId,
        status: "VALIDATED",
      },
    });
  } catch {
    // Non-critical
  }
}

/**
 * Delete PENDING learnings that duplicate existing VALIDATED knowledge.
 * Run this to clean up existing duplicates.
 */
export async function cleanupDuplicateLearnings(): Promise<number> {
  const pending = await prisma.learning.findMany({
    where: { status: "PENDING" },
    select: { id: true, content: true, guruId: true, publisherId: true, listId: true, createdAt: true },
    orderBy: { createdAt: "asc" }, // keep earliest, remove later duplicates
  });

  const toDelete = new Set<string>();

  // Pass 1: remove pending items that duplicate VALIDATED knowledge
  for (const p of pending) {
    if (await isDuplicate({ content: p.content, guruId: p.guruId ?? undefined, publisherId: p.publisherId ?? undefined, listId: p.listId ?? undefined })) {
      toDelete.add(p.id);
    }
  }

  // Pass 2: deduplicate within pending itself (keep earliest, remove near-duplicates)
  // Group by entity for efficiency
  const groups: Record<string, typeof pending> = {};
  for (const p of pending) {
    if (toDelete.has(p.id)) continue;
    const key = p.guruId ?? p.publisherId ?? p.listId ?? "__general__";
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  for (const items of Object.values(groups)) {
    for (let i = 0; i < items.length; i++) {
      if (toDelete.has(items[i].id)) continue;
      for (let j = i + 1; j < items.length; j++) {
        if (toDelete.has(items[j].id)) continue;
        const overlap = wordOverlap(items[i].content, items[j].content);
        if (overlap >= OVERLAP_THRESHOLD || items[i].content.trim().toLowerCase() === items[j].content.trim().toLowerCase()) {
          toDelete.add(items[j].id); // keep [i] (older), remove [j]
        }
      }
    }
  }

  if (toDelete.size) {
    await prisma.learning.deleteMany({ where: { id: { in: [...toDelete] } } });
  }

  return toDelete.size;
}
