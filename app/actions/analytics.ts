"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/app/actions/admin";
import { ANALYTICS_COOKIE } from "@/lib/analytics";

/**
 * Excluding a browser from analytics.
 *
 * Keyed on the anonymous `gba_vid` cookie, not on city or IP. Filtering by city
 * looked obvious and is wrong twice over: Wasaga Beach is a real Georgian Bay
 * town whose residents are plausible customers, and the owner's own cookie has
 * turned up from Ottawa and Little Current. The cookie follows the person.
 *
 * The cookie is httpOnly and set at path "/", so it reaches the admin too —
 * which is what lets the button below identify the browser it's clicked from
 * without the visitor ever having to know their own id.
 */

export type ExcludeResult = { ok: true; visitorId: string } | { ok: false; error: string };

/** Stop counting the browser this was clicked from. */
export async function excludeThisBrowserAction(label?: string): Promise<ExcludeResult> {
  await requireAuth();

  const visitorId = (await cookies()).get(ANALYTICS_COOKIE)?.value;
  if (!visitorId || visitorId.length < 8) {
    return {
      ok: false,
      error:
        "This browser has no analytics cookie yet. Visit the public site once in " +
        "this browser, then try again.",
    };
  }

  const existing = await prisma.excludedVisitor.findUnique({ where: { visitorId } });
  if (existing) return { ok: true, visitorId };

  await prisma.excludedVisitor.create({
    data: { visitorId, label: label?.trim() || null },
  });
  revalidatePath("/admin/analytics");
  return { ok: true, visitorId };
}

/** Count a browser again. Past events stay purged — this only affects new ones. */
export async function removeExclusionAction(visitorId: string): Promise<void> {
  await requireAuth();
  await prisma.excludedVisitor.delete({ where: { visitorId } }).catch(() => {});
  revalidatePath("/admin/analytics");
}

export type ExcludedRow = {
  visitorId: string;
  label: string | null;
  createdAt: string;
  isThisBrowser: boolean;
  /** Events still on record for this browser — purge with npm run analytics:purge-excluded */
  remainingEvents: number;
};

/** The exclusion list, flagging whichever row is the caller's own browser. */
export async function getExclusionsAction(): Promise<ExcludedRow[]> {
  await requireAuth();
  const mine = (await cookies()).get(ANALYTICS_COOKIE)?.value ?? null;
  const rows = await prisma.excludedVisitor.findMany({ orderBy: { createdAt: "asc" } });

  return Promise.all(
    rows.map(async (r) => ({
      visitorId: r.visitorId,
      label: r.label,
      createdAt: r.createdAt.toISOString(),
      isThisBrowser: r.visitorId === mine,
      remainingEvents: await prisma.analyticsEvent.count({
        where: { visitorId: r.visitorId },
      }),
    }))
  );
}
