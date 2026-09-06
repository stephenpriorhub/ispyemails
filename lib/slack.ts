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

export async function postToSlack(text: string): Promise<SlackResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_PROMO_CHANNEL;

  if (!token || !channel) {
    return { ok: false, skipped: "SLACK_BOT_TOKEN / SLACK_PROMO_CHANNEL not set" };
  }
  // Explicit off-switch so the digest can be built and reviewed before it posts.
  if (process.env.SLACK_PROMO_ENABLED !== "true") {
    return { ok: false, skipped: "SLACK_PROMO_ENABLED is not 'true'" };
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        channel,
        text,
        mrkdwn: true,
        unfurl_links: false, // 15 promo links would unfurl into an unreadable wall
        unfurl_media: false,
      }),
    });
    const data = (await res.json()) as { ok: boolean; ts?: string; channel?: string; error?: string };
    return data.ok ? { ok: true, ts: data.ts, channel: data.channel } : { ok: false, error: data.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "post failed" };
  }
}
