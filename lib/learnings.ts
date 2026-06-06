import { prisma } from "./prisma";

type LearningCategory = "GURU" | "PUBLISHER" | "LIST" | "TOPIC" | "GENERAL";

/**
 * Check if a new learning potentially contradicts existing validated knowledge
 * for the same entity. Uses simple keyword/semantic heuristics — not AI.
 */
async function detectContradiction(opts: {
  content: string;
  guruId?: string;
  publisherId?: string;
  listId?: string;
}): Promise<boolean> {
  // Find validated learnings for the same entity
  const where: Record<string, unknown> = { status: "VALIDATED" };
  if (opts.guruId) where.guruId = opts.guruId;
  else if (opts.publisherId) where.publisherId = opts.publisherId;
  else if (opts.listId) where.listId = opts.listId;
  else return false; // no entity link = can't contradict

  const existing = await prisma.learning.findMany({ where, select: { content: true } });
  if (!existing.length) return false;

  // Contradiction signals: opposing sentiment words about the same subject
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
      ) {
        return true;
      }
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
    // Non-critical — don't break email processing if learning fails to save
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
        status: "VALIDATED", // user actions are auto-validated
      },
    });
  } catch {
    // Non-critical
  }
}
