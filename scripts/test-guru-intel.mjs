/**
 * Unit test for the iSpy Learning → Brain API `guru-live-intel` item mapping.
 * Pure: no Prisma / fs / network. Mirrors brain-map's scripts/test-ingest.mjs style.
 *
 * Run (Node 22+, which strips TS types natively):
 *   node scripts/test-guru-intel.mjs
 * (Node here is v26; direct .ts import works. The imported module has NO runtime
 *  dependencies, so no build/prisma-generate is required to run this test.)
 */

import assert from "node:assert/strict";
import { toGuruLiveIntelItem, isoDate } from "../lib/guru-live-intel.ts";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// ─── Full mapping: all fields present ────────────────────────────────────────

test("maps a fully-populated learning to a guru-live-intel item", () => {
  const learning = {
    content: "Pitching a new 5G microcap play with a doubling promise",
    createdAt: "2026-06-30T12:00:00.000Z",
    emailId: "cuid-email-1",
    guru: { name: "Ray Blanco", publisher: { name: "Paradigm Press" } },
    list: { name: "Technology Profits Confidential" },
    email: {
      subject: "The tiny stock behind the 5G boom",
      receivedAt: "2026-07-01T09:30:00.000Z",
      gmailMessageId: "gmail-abc123",
      emailType: "PROMO",
    },
  };

  const item = toGuruLiveIntelItem(learning, "Paradigm Press");

  assert.deepEqual(item, {
    date: "2026-07-01", // email.receivedAt wins over createdAt
    publication: "Technology Profits Confidential", // list name wins
    angle: "Pitching a new 5G microcap play with a doubling promise",
    subjectLine: "The tiny stock behind the 5G boom",
    tactic: "PROMO",
    sourceEmailId: "gmail-abc123", // gmailMessageId wins over emailId
  });
});

// ─── date fallback: no email → learning.createdAt ────────────────────────────

test("date falls back to learning.createdAt when email is missing", () => {
  const item = toGuruLiveIntelItem({
    content: "Editor mentioned a new options service launching soon",
    createdAt: "2026-05-15T00:00:00.000Z",
    guru: { name: "Nate Bear", publisher: { name: "Monument Traders Alliance" } },
  });
  assert.equal(item.date, "2026-05-15");
});

// ─── publication fallback chain: no list → guruPublisherName ─────────────────

test("publication falls back to the passed publisher name when no list", () => {
  const item = toGuruLiveIntelItem(
    {
      content: "Repeated 'last chance' urgency across 3 sends",
      createdAt: "2026-06-01T00:00:00.000Z",
      guru: { name: "Alexander Green", publisher: { name: "Oxford Club" } },
    },
    "Oxford Club",
  );
  assert.equal(item.publication, "Oxford Club");
});

// ─── publication fallback chain: no list, no passed name → guru.publisher ────

test("publication falls back to guru.publisher.name when nothing passed", () => {
  const item = toGuruLiveIntelItem({
    content: "Some observation",
    createdAt: "2026-06-01T00:00:00.000Z",
    guru: { name: "Alexander Green", publisher: { name: "Oxford Club" } },
  });
  assert.equal(item.publication, "Oxford Club");
});

// ─── publication fallback chain: nothing → "Unknown" ─────────────────────────

test('publication is "Unknown" when no list/publisher anywhere', () => {
  const item = toGuruLiveIntelItem({
    content: "Some observation",
    createdAt: "2026-06-01T00:00:00.000Z",
    guru: { name: "Mystery Editor" },
  });
  assert.equal(item.publication, "Unknown");
});

// ─── sourceEmailId fallback: no gmailMessageId → emailId ─────────────────────

test("sourceEmailId falls back to emailId, then empty string", () => {
  const withEmailId = toGuruLiveIntelItem({
    content: "x",
    createdAt: "2026-06-01T00:00:00.000Z",
    emailId: "cuid-only",
    guru: { name: "G" },
  });
  assert.equal(withEmailId.sourceEmailId, "cuid-only");

  const withNothing = toGuruLiveIntelItem({
    content: "x",
    createdAt: "2026-06-01T00:00:00.000Z",
    guru: { name: "G" },
  });
  assert.equal(withNothing.sourceEmailId, "");
});

// ─── tactic + subjectLine defaults when email absent ─────────────────────────

test("tactic defaults to UNKNOWN and subjectLine to empty when no email", () => {
  const item = toGuruLiveIntelItem({
    content: "x",
    createdAt: "2026-06-01T00:00:00.000Z",
    guru: { name: "G" },
  });
  assert.equal(item.tactic, "UNKNOWN");
  assert.equal(item.subjectLine, "");
});

// ─── isoDate accepts Date objects too ────────────────────────────────────────

test("isoDate handles a Date instance", () => {
  const item = { createdAt: new Date("2026-03-09T23:59:00.000Z") };
  assert.equal(isoDate(item), "2026-03-09");
});

console.log(`\n${passed} test(s) passed.`);
