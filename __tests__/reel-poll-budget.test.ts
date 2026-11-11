import { describe, it, expect } from "vitest";
import fs from "node:fs";

/**
 * Two constants in different files have to move together.
 *
 * The reel poll budget lives in lib/instagram.ts; the maxDuration it must stay
 * under lives in each segment that can publish — the cron route AND the admin
 * page, because publishNowAction runs in that page's function.
 *
 * Publishing happens AFTER the poll. If the budget ever exceeds a segment's
 * maxDuration, that function is killed partway through the publish call, which
 * is the one failure that cannot be retried: the post is live on Instagram and
 * nothing in the database knows it. Raising one without the other is exactly
 * how that happens, and nothing else would catch it — it only shows up on a
 * slow transcode, in production, as a duplicate or lost post.
 */

const read = (p: string) => fs.readFileSync(p, "utf8");

const budgetMs = (() => {
  const m = read("lib/instagram.ts").match(/REEL_POLL_BUDGET_MS\s*=\s*Number\([^?]+\?\?\s*([\d_]+)\)/);
  if (!m) throw new Error("could not find the reel poll budget default");
  return Number(m[1]!.replace(/_/g, ""));
})();

const maxDurationOf = (file: string) => {
  const m = read(file).match(/^export const maxDuration\s*=\s*(\d+)/m);
  if (!m) throw new Error(`no maxDuration in ${file}`);
  return Number(m[1]);
};

/** Every segment whose function can end up polling Meta for a Reel. */
const PUBLISHING_SEGMENTS = [
  "app/api/cron/instagram/route.ts",
  "app/admin/instagram/page.tsx",
];

/** Publish + settle + the database write that records it, after the poll ends. */
const PUBLISH_TAIL_SECONDS = 25;

describe("reel poll budget vs function timeouts", () => {
  it.each(PUBLISHING_SEGMENTS)("%s leaves room to publish after the poll", (file) => {
    const max = maxDurationOf(file);
    expect(
      budgetMs / 1000,
      `${file} allows ${max}s but the poll can run ${budgetMs / 1000}s — ` +
        `raise maxDuration with the budget, or publishing gets killed mid-flight`
    ).toBeLessThanOrEqual(max - PUBLISH_TAIL_SECONDS);
  });

  it("keeps both publishing segments on the same timeout", () => {
    const [cron, admin] = PUBLISHING_SEGMENTS.map(maxDurationOf);
    expect(cron).toBe(admin);
  });

  it("still allows several poll attempts", () => {
    // A budget under one interval would give up before asking twice.
    expect(budgetMs).toBeGreaterThan(4_000 * 3);
  });
});
