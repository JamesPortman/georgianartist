"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { CATALOGUE_TAG } from "@/lib/catalogue-tag";
import { prisma } from "@/lib/db";
import { uploadMedia } from "@/lib/private-blob";
import { embedCopyright } from "@/lib/image-copyright";
import { prepareHomePhoto } from "@/lib/home-photo";
import { releaseBlob } from "@/lib/blob-cleanup";
import { parseExampleFields } from "@/lib/commissions";
import { requireAuth } from "@/app/actions/admin";

/**
 * The admin for /commissions: add, edit, hide, reorder and delete examples.
 *
 * Every action checks the session before anything else
 * (__tests__/server-actions-auth.test.ts calls each one without a session).
 */

const RASTER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * The example's image, ready to store. Re-encoded (prepareHomePhoto), so no
 * metadata the original carried survives, whatever the file was: the photo a
 * client sent of their dog may well carry their home's GPS, and a camera
 * phone shot of the finished painting can too. Then stamped with the artist's
 * copyright, because the painting is the artist's work. Throws on anything
 * that can't be decoded, so nothing is published as-is.
 */
async function storeImage(file: File): Promise<string> {
  const clean = await prepareHomePhoto(Buffer.from(await file.arrayBuffer()));
  return uploadMedia("commissions/example.jpg", embedCopyright(clean), {
    contentType: "image/jpeg",
    addRandomSuffix: true,
  });
}

const imageFrom = (formData: FormData): File | null => {
  const f = formData.get("image");
  return f instanceof File && f.size > 0 ? f : null;
};

function refresh() {
  updateTag(CATALOGUE_TAG);
  revalidatePath("/commissions");
  revalidatePath("/admin/commissions");
}

export async function createCommissionAction(formData: FormData) {
  await requireAuth();
  const parsed = parseExampleFields((k) => formData.get(k));
  if (!parsed.ok) return { error: parsed.error };
  const file = imageFrom(formData);
  if (!file) return { error: "An image is required." };
  if (!RASTER_TYPES.includes(file.type)) return { error: "The image must be a JPEG, PNG, WebP or AVIF file." };

  try {
    const image = await storeImage(file);
    const max = await prisma.commissionExample.aggregate({ _max: { sortOrder: true } });
    await prisma.commissionExample.create({
      data: {
        ...parsed.fields,
        image,
        blurDataURL: (formData.get("blurDataURL") as string) || null,
        visible: formData.get("visible") === "on",
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
  } catch (e) {
    return { error: `Could not save the example: ${e instanceof Error ? e.message : "unknown error"}` };
  }
  refresh();
  redirect("/admin/commissions");
}

export async function updateCommissionAction(id: string, formData: FormData) {
  await requireAuth();
  const existing = await prisma.commissionExample.findUnique({ where: { id } });
  if (!existing) return { error: "Example not found." };
  const parsed = parseExampleFields((k) => formData.get(k));
  if (!parsed.ok) return { error: parsed.error };

  const data: Prisma.CommissionExampleUpdateInput = {
    ...parsed.fields,
    visible: formData.get("visible") === "on",
  };
  const file = imageFrom(formData);
  try {
    if (file) {
      if (!RASTER_TYPES.includes(file.type)) return { error: "The image must be a JPEG, PNG, WebP or AVIF file." };
      data.image = await storeImage(file);
      data.blurDataURL = (formData.get("blurDataURL") as string) || null;
    }
    await prisma.commissionExample.update({ where: { id }, data });
  } catch (e) {
    return { error: `Could not save the example: ${e instanceof Error ? e.message : "unknown error"}` };
  }
  // The row no longer points at the old file, so nothing does.
  if (file) await releaseBlob(existing.image);
  refresh();
  redirect("/admin/commissions");
}

export async function toggleCommissionVisibleAction(id: string, visible: boolean) {
  await requireAuth();
  await prisma.commissionExample.update({ where: { id }, data: { visible } });
  refresh();
}

export async function deleteCommissionAction(id: string) {
  await requireAuth();
  const existing = await prisma.commissionExample.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.commissionExample.delete({ where: { id } });
  await releaseBlob(existing.image);
  refresh();
}

/** One statement, so the order is applied whole or not at all (as for products). */
export async function reorderCommissionsAction(orderedIds: string[]) {
  await requireAuth();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;
  const values = Prisma.join(orderedIds.map((id, i) => Prisma.sql`(${String(id)}::text, ${i}::int)`));
  await prisma.$executeRaw`
    UPDATE "CommissionExample" AS c SET "sortOrder" = v.ord
    FROM (VALUES ${values}) AS v(id, ord)
    WHERE c.id = v.id`;
  refresh();
}
