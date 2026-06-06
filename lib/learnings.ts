import { prisma } from "./prisma";

type LearningCategory = "GURU" | "PUBLISHER" | "LIST" | "TOPIC" | "GENERAL";

export async function logAILearning(opts: {
  content: string;
  category?: LearningCategory;
  emailId?: string;
  guruId?: string;
  publisherId?: string;
  listId?: string;
}) {
  try {
    await prisma.learning.create({
      data: {
        content: opts.content,
        source: "AI_EMAIL",
        category: opts.category ?? "GENERAL",
        emailId: opts.emailId,
        guruId: opts.guruId,
        publisherId: opts.publisherId,
        listId: opts.listId,
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
