"use server";

import { revalidatePath, updateTag } from "next/cache";
import { CATALOGUE_TAG } from "@/lib/catalogue-tag";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/app/actions/admin";

/**
 * The admin for the making-of films: show or hide each one.
 *
 * A hidden film leaves /making-of, its work's page and its pin on the
 * Locations map (every public read filters on `visible`, lib/making-of.ts),
 * and when none is visible the Making Of link leaves the menu, the About page
 * and the sitemap. The files stay on Blob, so showing it again is instant.
 * Films are still added by scripts/publish-films.ts.
 *
 * Checks the session before anything else
 * (__tests__/server-actions-auth.test.ts calls it without one).
 */
export async function toggleFilmVisibleAction(id: string, visible: boolean) {
  await requireAuth();
  await prisma.makingOf.update({ where: { id }, data: { visible } });
  // The film is read on its work's page, the map, the menu and the sitemap,
  // all through the catalogue cache; the layout revalidation covers the menu.
  updateTag(CATALOGUE_TAG);
  revalidatePath("/", "layout");
}
