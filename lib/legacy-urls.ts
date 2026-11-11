/**
 * Old Squarespace URLs that still get traffic.
 *
 * The site used /home/p/<slug>. Those links are still in Google's index, in
 * old emails, and on other people's pages, and they have been landing on the
 * 404 page — 642 hits across 24 paths in three months. Some of them are for
 * work that is still for sale: /home/p/lora-bay, /home/p/northwinds-beach,
 * /home/p/manitoulin-island, /home/p/council-beach, /home/p/inglis-falls.
 *
 * Those get a permanent redirect to the work's real page.
 *
 * Everything else is 410 Gone, deliberately. Redirecting gone content to the
 * homepage is a soft 404: search engines treat a pile of unrelated redirects
 * worse than an honest answer, and a visitor who clicked "Lone Tree" is not
 * helped by silently landing on the gallery wondering what happened. The
 * biggest single legacy URL, /home/p/lone-tree with 448 hits, is a painting
 * that genuinely no longer exists. Until October 2026 these were 404s; a 410
 * says the same thing more firmly, and search engines drop a 410 from their
 * index sooner, which is what stops the traffic.
 *
 * The one exception is a slug that matches a work that is only hidden: that
 * stays a 404, since the work may come back and its old URL with it.
 */

import { productPath } from "@/lib/product-path";

export interface LegacyCandidate {
  id: string;
  slug?: string | null;
  title: string;
  type: string;
  visible: boolean;
}

/**
 * Renames, where only a human knows the old name and the new one are the same
 * painting. "Spirit Rock" was retitled "Near Killarney" across the catalogue.
 */
const RENAMED: Record<string, string> = {
  "spirit-rock": "near-killarney",
};

const words = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  );

/** Jaccard overlap — 1 is the same set of words, 0 shares none. */
function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (A.size === 0 || B.size === 0) return 0;
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / new Set([...A, ...B]).size;
}

/**
 * High on purpose. Every genuine match in the traffic scores 1.00, because the
 * old slug was built from the same title ("alpine-ski-club-fall" against
 * "Alpine Ski Club: Fall"). The best wrong answer scores 0.40. Sending someone
 * to the wrong painting is worse than showing them a 404, so the threshold
 * sits in the gap rather than near it.
 */
const MATCH_FLOOR = 0.7;

export const pathFor = productPath;

/**
 * Where an old /home/p/<slug> URL should go, or null to let it 404.
 *
 * Only ever resolves to a visible work: redirecting to something hidden or
 * deleted would just be a slower 404.
 */
export function resolveLegacySlug(
  slug: string,
  catalogue: LegacyCandidate[]
): string | null {
  const wanted = (RENAMED[slug] ?? slug).toLowerCase();
  const live = catalogue.filter((p) => p.visible);

  const exact = live.find((p) => p.id.toLowerCase() === wanted);
  if (exact) return pathFor(exact);

  // The old slug was generated from the title, so the title is the stronger
  // signal — "blue-mountain-sunset" is the id "blue-mountain-sunset-2".
  let best: LegacyCandidate | null = null;
  let score = 0;
  for (const p of live) {
    const s = Math.max(similarity(wanted, p.title), similarity(wanted, p.id));
    if (s > score) {
      score = s;
      best = p;
    }
  }
  return best && score >= MATCH_FLOOR ? pathFor(best) : null;
}

export type LegacyOutcome =
  | { kind: "redirect"; to: string }
  | { kind: "hidden" }
  | { kind: "gone" };

/**
 * What an old /home/p/<slug> URL should answer: a permanent redirect to a
 * visible work, a 404 when it matches a work that is only hidden for now, or
 * 410 Gone when it matches nothing in the catalogue at all.
 */
export function legacyOutcome(slug: string, catalogue: LegacyCandidate[]): LegacyOutcome {
  const to = resolveLegacySlug(slug, catalogue);
  if (to) return { kind: "redirect", to };
  // The same match against every work, hidden ones included.
  const all = catalogue.map((p) => ({ ...p, visible: true }));
  return resolveLegacySlug(slug, all) ? { kind: "hidden" } : { kind: "gone" };
}
