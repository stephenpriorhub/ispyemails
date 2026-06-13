import { google } from "googleapis";
import { prisma } from "./prisma";
import { getAuthedClient, placementFromLabels, extractHeader, parseFrom, extractBodies } from "./gmail";
import { analyzeEmail } from "./analyze";

export async function syncGmailAccount(accountEmail: string): Promise<{ newEmails: number; errors: number }> {
  let newEmails = 0, errors = 0;
  const auth = await getAuthedClient(accountEmail);
  const gmail = google.gmail({ version: "v1", auth });
  const account = await prisma.gmailAccount.findUnique({ where: { email: accountEmail } });
  if (!account) throw new Error("Account not found");

  let messageIds: string[] = [];
  if (account.historyId) {
    try {
      const historyRes = await gmail.users.history.list({ userId: "me", startHistoryId: account.historyId, historyTypes: ["messageAdded"] });
      for (const h of historyRes.data.history ?? []) for (const msg of h.messagesAdded ?? []) if (msg.message?.id) messageIds.push(msg.message.id);
      if (historyRes.data.historyId) await prisma.gmailAccount.update({ where: { email: accountEmail }, data: { historyId: historyRes.data.historyId, lastSyncAt: new Date() } });
    } catch (e: unknown) {
      if ((e as { code?: number }).code === 404 || (e as { status?: number }).status === 404) {
        messageIds = await getRecentMessageIds(gmail);
      } else throw e;
    }
  } else {
    messageIds = await getRecentMessageIds(gmail);
    const profileRes = await gmail.users.getProfile({ userId: "me" });
    await prisma.gmailAccount.update({ where: { email: accountEmail }, data: { historyId: profileRes.data.historyId ?? undefined, lastSyncAt: new Date() } });
  }

  for (const msgId of [...new Set(messageIds)]) {
    try {
      if (await prisma.email.findUnique({ where: { gmailMessageId: msgId } })) continue;
      const msgRes = await gmail.users.messages.get({ userId: "me", id: msgId, format: "full" });
      const msg = msgRes.data;
      const rawHeaders = msg.payload?.headers ?? [];
      const headers = rawHeaders.map((h) => ({ name: h.name ?? "", value: h.value ?? "" }));
      const labelIds = msg.labelIds ?? [];
      const from = parseFrom(extractHeader(headers, "From"));
      const subject = extractHeader(headers, "Subject") || "(no subject)";
      const to = extractHeader(headers, "To");
      const dateStr = extractHeader(headers, "Date");
      const receivedAt = dateStr ? new Date(dateStr) : new Date();
      const payload = msg.payload ?? {};
      const { html, text } = extractBodies({ mimeType: payload.mimeType ?? undefined, body: payload.body ? { data: payload.body.data ?? undefined } : undefined, parts: payload.parts ?? undefined });
      const placement = placementFromLabels(labelIds);

      const publishers = await prisma.publisher.findMany({ select: { id: true, knownFromAddresses: true, domains: true } });
      let publisherId: string | null = null, publisherConfirmed = false;
      for (const pub of publishers) {
        if (pub.knownFromAddresses.includes(from.email)) { publisherId = pub.id; publisherConfirmed = true; break; }
        if (pub.domains.some((d) => { const ed = (from.email.toLowerCase().split("@")[1] ?? ""); const pd = d.toLowerCase(); return ed === pd || ed.endsWith("." + pd); })) { publisherId = pub.id; break; }
      }

      const email = await prisma.email.create({ data: { gmailMessageId: msgId, subject, fromName: from.name, fromEmail: from.email, toEmail: to, receivedAt, bodyHtml: html, bodyText: text, snippet: msg.snippet?.substring(0, 500), inboxPlacement: placement as "PRIMARY"|"PROMOTIONS"|"SPAM"|"UPDATES"|"SOCIAL"|"UNKNOWN", publisherId, publisherConfirmed, isProcessed: false } });
      newEmails++;
      if (labelIds.includes("UNREAD")) await gmail.users.messages.modify({ userId: "me", id: msgId, requestBody: { removeLabelIds: ["UNREAD"] } });
      if (process.env.ANTHROPIC_API_KEY) {
        await analyzeEmail(email.id, subject, from.name, from.email, text, html);
        // Verify all required fields are set; if not, retry once before giving up
        const classified = await prisma.email.findUnique({
          where: { id: email.id },
          select: { publisherId: true, listId: true, emailType: true, isProcessed: true, topics: { select: { topicId: true } } },
        });
        const missingFields: string[] = [];
        if (!classified?.publisherId) missingFields.push("publisher");
        if (!classified?.listId) missingFields.push("list");
        if (!classified?.topics || classified.topics.length === 0) missingFields.push("topics");
        if (!classified?.emailType || classified.emailType === "UNKNOWN") missingFields.push("emailType");
        if (missingFields.length > 0) {
          console.warn(`⚠ Missing after analysis [${email.id}]: ${missingFields.join(", ")} — retrying`);
          await analyzeEmail(email.id, subject, from.name, from.email, text, html);
          // Check again; if still missing, force-set safe defaults
          const recheck = await prisma.email.findUnique({
            where: { id: email.id },
            select: { publisherId: true, listId: true, emailType: true, topics: { select: { topicId: true } } },
          });
          const stillMissing: string[] = [];
          if (!recheck?.publisherId) stillMissing.push("publisher");
          if (!recheck?.listId) stillMissing.push("list");
          if (!recheck?.topics || recheck.topics.length === 0) stillMissing.push("topics");
          if (!recheck?.emailType || recheck.emailType === "UNKNOWN") stillMissing.push("emailType");
          if (stillMissing.length > 0) {
            console.error(`✗ Still missing after retry [${email.id}]: ${stillMissing.join(", ")} — applying safe defaults`);
            // Ensure at least one topic exists
            let topicId: string | null = null;
            if (stillMissing.includes("topics")) {
              const fallbackTopic = await prisma.topic.upsert({ where: { name: "markets" }, update: {}, create: { name: "markets" } });
              topicId = fallbackTopic.id;
            }
            await prisma.email.update({
              where: { id: email.id },
              data: {
                emailType: stillMissing.includes("emailType") ? "EDITORIAL" : undefined,
                isProcessed: true,
                ...(topicId ? { topics: { deleteMany: {}, create: [{ topicId, confidence: 1.0 }] } } : {}),
              },
            });
          } else {
            // Retry succeeded — mark processed if not already done by analyzeEmail
            const final = await prisma.email.findUnique({ where: { id: email.id }, select: { isProcessed: true } });
            if (!final?.isProcessed) await prisma.email.update({ where: { id: email.id }, data: { isProcessed: true } });
          }
        }
      } else {
        // No API key — mark processed immediately with defaults
        await prisma.email.update({ where: { id: email.id }, data: { isProcessed: true } });
      }
    } catch (err) { console.error(`Error processing ${msgId}:`, err); errors++; }
  }
  return { newEmails, errors };
}

async function getRecentMessageIds(gmail: ReturnType<typeof google.gmail>): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      maxResults: 500,
      q: "newer_than:365d",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}
