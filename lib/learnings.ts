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
    if (wordOverlap(opts.content, v.content) >= 0.65) return true;
    // Also catch near-exact match regardless of entity link
    if (opts.content.trim().toLowerCase() === v.content.trim().toLowerCase()) return true;
  }
  return false;
}

/**
 * Check if a new learning contradicts existing validated knowledge.
 */
async function detectContradiction(opts: {
  content: string;
  guruId?: string;
  publisherId?: string;
  listId?: string;
}): Promise<boolean> {
  const where: Record<string, unknown> = { status: "VALIDATED" };
  if (opts.guruId) where.guruId = opts.guruId;
  else if (opts.publisherId) where.publisherId = opts.publisherId;
  else if (opts.listId) where.listId = opts.listId;
  else return false;

  const existing = await prisma.learning.findMany({ where, select: { content: true } });
  if (!existing.length) return false;

  const newLower = opts.content.toLowerCase();
  const contradictionPairs = [
    ["launched", "shut down"], ["launched", "closed"], ["launched", "discontinued"],
    ["new", "retired"], ["new", "ended"],
    ["partnered", "split"], ["partnered", "separated"],
    ["same person", "different person"], ["merged", "split"],
    ["primary editor", "secondary"], ["left", "joined"],
    ["joined", "left"], ["no longer", "still"],
  ];

  for (const validated of existing) {
    const valLower = validated.content.toLowerCase();
    for (const [a, b] of contradictionPairs) {
      if (
        (newLower.includes(a) && valLower.includes(b)) ||
        (newLower.includes(b) && valLower.includes(a))
      ) return true;
    }
  }
  return false;
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

    const isContradicted = await detectContradiction(opts);
    await prisma.learning.create({
      data: {
        content: opts.content,
        source: "AI_EMAIL",
        category: opts.category ?? "GENERAL",
        emailId: opts.emailId,
        guruId: opts.guruId,
        publisherId: opts.publisherId,
        listId: opts.listId,
        isContradicted,
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
    select: { id: true, content: true, guruId: true, publisherId: true, listId: true },
  });

  const toDelete: string[] = [];

  for (const p of pending) {
    if (await isDuplicate({ content: p.content, guruId: p.guruId ?? undefined, publisherId: p.publisherId ?? undefined, listId: p.listId ?? undefined })) {
      toDelete.push(p.id);
    }
  }

  if (toDelete.length) {
    await prisma.learning.deleteMany({ where: { id: { in: toDelete } } });
  }

  return toDelete.length;
}
