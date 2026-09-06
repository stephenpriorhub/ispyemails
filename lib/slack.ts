/**
 * Slack posting for the ISpyFinpub Agent bot.
 *
 * The bot currently holds only `chat:write`, so it can post but cannot look up
 * channels — SLACK_PROMO_CHANNEL must name a channel the bot has been invited to.
 */

export interface SlackResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
  skipped?: string;
}

export const slackConfigured = (): boolean =>
  Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_PROMO_CHANNEL);

/** Slack caps a message at 50 blocks, so a long report goes out in parts. */
const MAX_BLOCKS = 45;

export async function postToSlack(text: string, blocks?: unknown[]): Promise<SlackResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_PROMO_CHANNEL;

  if (!token || !channel) {
    return { ok: false, skipped: "SLACK_BOT_TOKEN / SLACK_PROMO_CHANNEL not set" };
  }
  // Explicit off-switch so the digest can be built and reviewed before it posts.
  if (process.env.SLACK_PROMO_ENABLED !== "true") {
    return { ok: false, skipped: "SLACK_PROMO_ENABLED is not 'true'" };
  }

  const batches: (unknown[] | null)[] = blocks?.length
    ? chunk(blocks, MAX_BLOCKS)
    : [null];

  let firstTs: string | undefined;
  let postedChannel: string | undefined;

  try {
    for (const batch of batches) {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          channel,
          // `text` is the notification/fallback line when blocks are present.
          text: batch ? "Here are the promos that are being pushed around the industry" : text,
          ...(batch ? { blocks: batch } : { mrkdwn: true }),
          unfurl_links: false, // 30 promo links would unfurl into an unreadable wall
          unfurl_media: false,
        }),
      });
      const data = (await res.json()) as { ok: boolean; ts?: string; channel?: string; error?: string };
      if (!data.ok) return { ok: false, error: data.error, ts: firstTs };
      firstTs ??= data.ts;
      postedChannel ??= data.channel;
    }
    return { ok: true, ts: firstTs, channel: postedChannel };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "post failed" };
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
