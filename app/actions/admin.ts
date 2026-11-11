"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { CATALOGUE_TAG } from "@/lib/catalogue-tag";
import { uploadMedia } from "@/lib/private-blob";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { sizeOptions } from "@/data/products";
import { deriveSizeType, standardPrice, slugify } from "@/lib/product-utils";
import { productSlug, slugProblem } from "@/lib/product-path";
import { slugTakenBy } from "@/lib/product-lookup";
// Uploads are re-encoded by the browser's canvas before they get here, which
// strips whatever metadata the original carried. Without this every image
// added through the admin reaches Blob with no authorship claim at all —
// scripts/embed-copyright.js only ever sees the files committed to the repo.
import { embedCopyright } from "@/lib/image-copyright";
import { prepareHomePhoto } from "@/lib/home-photo";
import { releaseBlob } from "@/lib/blob-cleanup";
import { isRateLimited, recordFailure, clearFailures, loginKey } from "@/lib/rate-limit";
import { passwordLoginAllowed } from "@/lib/passkey";
import { passwordMatches } from "@/lib/admin-password";
import { Prisma } from "@prisma/client";
import { clientIp } from "@/lib/client-ip";

const VALID_SIZE_TYPES = Object.keys(sizeOptions);

/**
 * The image types an upload may be stored as. The browser re-encodes uploads
 * to JPEG first, but the type is whatever the request says, and it becomes
 * the stored file's Content-Type: an SVG (which can carry script) was
 * accepted as an "image/" like any other (security review, October 2026).
 * Anything else is stored as JPEG, which a browser never runs.
 */
const RASTER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const uploadType = (type: string) => (RASTER_TYPES.includes(type) ? type : "image/jpeg");

// ── Auth ─────────────────────────────────────────────────────────────────────


export async function loginAction(formData: FormData) {
  const key = loginKey(await clientIp());

  const limited = await isRateLimited(key);
  if (limited.blocked) {
    const mins = Math.max(1, Math.ceil(limited.retryAfterSec / 60));
    return { error: `Too many attempts. Please try again in about ${mins} minute${mins === 1 ? "" : "s"}.` };
  }

  // Once a passkey is registered the password stops working, unless the
  // break-glass is on (lib/passkey.ts). Checked before the password itself,
  // so the answer says nothing about whether the password was right.
  // Fails closed: without the database the admin can't do anything anyway.
  let passkeys: number;
  try {
    passkeys = await prisma.adminPasskey.count();
  } catch {
    return { error: "Can't reach the database. Please try again shortly." };
  }
  if (!passwordLoginAllowed(passkeys)) {
    return { error: "This admin signs in with a passkey." };
  }

  if (!passwordMatches(formData.get("password"), process.env.ADMIN_PASSWORD)) {
    await recordFailure(key);
    return { error: "Incorrect password." };
  }

  await clearFailures(key);
  const session = await getAdminSession();
  session.isLoggedIn = true;
  await session.save();
  redirect("/admin/products");
}

export async function logoutAction() {
  const session = await getAdminSession();
  session.destroy();
  redirect("/admin/login");
}

// ── Toggles + edit (single-statement writes; HTTP client is fine) ─────────────

export async function toggleFieldAction(
  id: string,
  field: "visible" | "isNew" | "onSale" | "soldOut",
  value: boolean
) {
  await requireAuth();
  await prisma.product.update({ where: { id }, data: { [field]: value } });
  revalidateProductPaths(id);
}

export async function updateProductAction(id: string, formData: FormData) {
  await requireAuth();

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { error: "Product not found." };

  const data: Record<string, unknown> = {
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || null,
    category: formData.get("category") as string,
    sizeType: formData.get("sizeType") as string,
    price: parseInt(formData.get("price") as string, 10),
    isNew: formData.get("isNew") === "on",
    onSale: formData.get("onSale") === "on",
    soldOut: formData.get("soldOut") === "on",
    visible: formData.get("visible") === "on",
    naturalWidth: formData.get("naturalWidth")
      ? parseInt(formData.get("naturalWidth") as string, 10)
      : null,
    naturalHeight: formData.get("naturalHeight")
      ? parseInt(formData.get("naturalHeight") as string, 10)
      : null,
  };

  // Checked as on create: an unknown size type leaves the work with no sizes
  // to sell, and a blank price would be stored as NaN.
  if (!VALID_SIZE_TYPES.includes(data.sizeType as string)) {
    return { error: `Invalid size type. Must be one of: ${VALID_SIZE_TYPES.join(", ")}` };
  }
  if (!Number.isFinite(data.price)) return { error: "Price must be a number." };

  // The URL slug. Checked before any upload, so a refused slug wastes nothing.
  // The id never changes; a new slug moves the page and the old one keeps
  // redirecting (ProductSlug).
  const currentSlug = productSlug(existing);
  const rawSlug = (formData.get("slug") as string | null)?.trim().toLowerCase();
  const newSlug = rawSlug || currentSlug;
  if (newSlug !== currentSlug) {
    const problem = slugProblem(newSlug);
    if (problem) return { error: problem };
    const owner = await slugTakenBy(newSlug, id);
    if (owner) return { error: `"${newSlug}" is already the URL of another work (${owner}), or was. Choose another.` };
    data.slug = newSlug;
  }

  // Optional image replacement: a new file means upload it, point the product
  // at the new URL, and remove the old blob.
  const file = formData.get("image") as File | null;
  if (file && file.size > 0) {
    if (!RASTER_TYPES.includes(file.type)) {
      return { error: "Replacement file must be a JPEG, PNG, WebP or AVIF image." };
    }
    try {
      const buffer = embedCopyright(Buffer.from(await file.arrayBuffer()));
      const folder = existing.type === "photograph" ? "photographs" : "paintings";
      data.image = await uploadMedia(`${folder}/${id}.jpg`, buffer, {
        contentType: uploadType(file.type),
        addRandomSuffix: true, // fresh URL avoids CDN caching the old image
      });
      data.blurDataURL = (formData.get("blurDataURL") as string) || null;
      // The generated mockup showed the old image; the page falls back to
      // its CSS composite of the new one.
      data.mockupImage = null;
      // Only if nothing else still points at it — blobs can be shared.
      await releaseBlob(existing.image, { excludeProductId: id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return { error: `Could not upload replacement image: ${msg}` };
    }
  }

  // GPS applies to both types — for a painting it's where the inspiration photo
  // was taken, for a photograph where the photograph itself was taken.
  const lat = parseFloat(formData.get("inspirationLat") as string);
  const lng = parseFloat(formData.get("inspirationLng") as string);
  data.inspirationLat = Number.isFinite(lat) ? lat : null;
  data.inspirationLng = Number.isFinite(lng) ? lng : null;

  // The inspiration *photo* is paintings-only. It updates only when a new one
  // is uploaded (otherwise the existing one stays).
  if (existing.type === "painting") {
    const inspFile = formData.get("inspirationImage") as File | null;
    if (inspFile && inspFile.size > 0) {
      try {
        const buffer = embedCopyright(Buffer.from(await inspFile.arrayBuffer()));
        data.inspirationImage = await uploadMedia(`inspiration/${id}.jpg`, buffer, {
          contentType: uploadType(inspFile.type),
          addRandomSuffix: true,
        });
        await releaseBlob(existing.inspirationImage, { excludeProductId: id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown error";
        return { error: `Could not upload inspiration image: ${msg}` };
      }
    }

    // A collector's photo: removable as well as replaceable, since it is
    // someone else's picture of their own home and they may ask for it back.
    if (formData.get("removeHomePhoto") === "on") {
      data.homePhoto = null;
      data.homePhotoCredit = null;
      await releaseBlob(existing.homePhoto, { excludeProductId: id });
    } else {
      const homeFile = formData.get("homePhoto") as File | null;
      if (homeFile && homeFile.size > 0) {
        try {
          data.homePhoto = await uploadHomePhoto(homeFile, id);
          await releaseBlob(existing.homePhoto, { excludeProductId: id });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown error";
          return { error: `Could not upload the collector's photo: ${msg}` };
        }
      }
      data.homePhotoCredit = creditFrom(formData);
    }
  }

  try {
    if (data.slug) {
      // History first: until the product row moves, the old slug is still its
      // current one and wins the lookup, so a failure between these writes
      // leaves nothing broken. Reclaiming one of this work's own old slugs
      // takes it out of the history, so a slug is never in both places.
      await prisma.productSlug.upsert({
        where: { slug: currentSlug },
        create: { slug: currentSlug, productId: id },
        update: { productId: id },
      });
      await prisma.productSlug.deleteMany({ where: { slug: data.slug as string, productId: id } });
    }
    await prisma.product.update({ where: { id }, data });
  } catch (e) {
    // The slug history may already have changed; don't leave the cache behind it.
    updateTag(CATALOGUE_TAG);
    const msg = e instanceof Error ? e.message : "unknown error";
    return { error: `Could not save changes: ${msg}` };
  }

  revalidateProductPaths(id, [currentSlug, ...(data.slug ? [data.slug as string] : [])]);
  redirect("/admin/products");
}

// ── Create (image upload + insert) ────────────────────────────────────────────

export async function createProductAction(formData: FormData) {
  await requireAuth();

  const type = (formData.get("type") as string) === "photograph" ? "photograph" : "painting";
  const title = (formData.get("title") as string)?.trim();
  const category = (formData.get("category") as string)?.trim();
  let sizeType = (formData.get("sizeType") as string) || "";
  let price = parseInt(formData.get("price") as string, 10);
  const description = (formData.get("description") as string)?.trim() || null;
  const file = formData.get("image") as File | null;

  if (!title || !category || !file || file.size === 0) {
    return { error: "Title, category, and an image are all required." };
  }
  if (!RASTER_TYPES.includes(file.type)) {
    return { error: "Uploaded file must be a JPEG, PNG, WebP or AVIF image." };
  }
  if (sizeType && !VALID_SIZE_TYPES.includes(sizeType)) {
    return { error: `Invalid size type. Must be one of: ${VALID_SIZE_TYPES.join(", ")}` };
  }

  // Dimensions are computed in the browser and sent along — no server-side
  // image processing (sharp is unreliable in serverless functions).
  const naturalWidth = parseInt(formData.get("naturalWidth") as string, 10) || null;
  const naturalHeight = parseInt(formData.get("naturalHeight") as string, 10) || null;

  if (!sizeType && naturalWidth && naturalHeight) {
    sizeType = deriveSizeType(naturalWidth, naturalHeight);
  }
  if (!sizeType) sizeType = "landscape";
  if (!price || Number.isNaN(price)) price = standardPrice(sizeType);

  const id = await uniqueSlug(title);

  try {
    const buffer = embedCopyright(Buffer.from(await file.arrayBuffer()));
    const folder = type === "photograph" ? "photographs" : "paintings";
    const imageUrl = await uploadMedia(`${folder}/${id}.jpg`, buffer, {
      contentType: uploadType(file.type),
      addRandomSuffix: false,
    });

    const max = await prisma.product.aggregate({
      where: { type },
      _max: { sortOrder: true },
    });

    const insp = await uploadInspiration(formData, id, type);
    const homeFile = formData.get("homePhoto") as File | null;
    const homePhoto =
      type === "painting" && homeFile && homeFile.size > 0
        ? await uploadHomePhoto(homeFile, id)
        : null;

    await prisma.product.create({
      data: {
        id,
        type,
        title,
        image: imageUrl,
        category,
        sizeType,
        price,
        description,
        blurDataURL: (formData.get("blurDataURL") as string) || null,
        isNew: formData.get("isNew") === "on",
        onSale: formData.get("onSale") === "on",
        soldOut: formData.get("soldOut") === "on",
        // `=== "on"`, matching the edit form. This was `!== "off"`, but an
        // unticked checkbox sends nothing at all rather than "off" — so
        // unticking Visible on the Add form was ignored and every new work
        // went live, priced, with a Buy Now button, the moment it was saved.
        visible: formData.get("visible") === "on",
        sortOrder: (max._max.sortOrder ?? 0) + 1,
        naturalWidth: type === "photograph" ? naturalWidth : null,
        naturalHeight: type === "photograph" ? naturalHeight : null,
        inspirationImage: insp.image,
        inspirationLat: insp.lat,
        inspirationLng: insp.lng,
        homePhoto,
        homePhotoCredit: homePhoto ? creditFrom(formData) : null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { error: `Could not save product: ${msg}` };
  }

  revalidateProductPaths(id);
  redirect("/admin/products");
}

// ── Delete (remove row + blob) ────────────────────────────────────────────────

export async function deleteProductAction(id: string) {
  await requireAuth();
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return;

  await prisma.product.delete({ where: { id } });
  // Its old URLs now point at nothing; let them 404 like any other.
  await prisma.productSlug.deleteMany({ where: { productId: id } });

  // Both uploaded blobs, not just the main image — the inspiration photo used
  // to be left behind on every delete, which is where the orphans in the store
  // came from. Legacy local-path images aren't blobs and are left untouched.
  // The row is already gone, so nothing needs excluding from the reference
  // check; a blob still referenced belongs to another product.
  await releaseBlob(product.image);
  await releaseBlob(product.inspirationImage);
  await releaseBlob(product.homePhoto);
  await releaseBlob(product.mockupImage);

  revalidateProductPaths(id);
}

// ── Reorder (sequential single updates — no transaction needed) ───────────────

export async function reorderProductsAction(orderedIds: string[]) {
  await requireAuth();
  if (orderedIds.length === 0) return;
  // One statement, so the order is applied whole or not at all. This was a
  // loop of single updates — the Neon HTTP adapter has no transactions — and
  // a failure halfway left the gallery in an order nobody chose.
  // Cast both: Postgres types a parameter in VALUES as text unless told.
  const values = Prisma.join(orderedIds.map((id, i) => Prisma.sql`(${id}::text, ${i}::int)`));
  await prisma.$executeRaw`
    UPDATE "Product" AS p SET "sortOrder" = v.ord
    FROM (VALUES ${values}) AS v(id, ord)
    WHERE p.id = v.id`;
  updateTag(CATALOGUE_TAG);
  revalidatePath("/admin/products");
  revalidatePath("/");
  revalidatePath("/photographs");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Location GPS (both types) + the inspiration photo (paintings only). Used on
 * create. For a photograph the coordinates are where it was taken; for a
 * painting, where its inspiration photo was taken.
 */
async function uploadInspiration(
  formData: FormData,
  id: string,
  type: string
): Promise<{ image: string | null; lat: number | null; lng: number | null }> {
  const lat = parseFloat(formData.get("inspirationLat") as string);
  const lng = parseFloat(formData.get("inspirationLng") as string);
  let image: string | null = null;
  if (type === "painting") {
    const file = formData.get("inspirationImage") as File | null;
    if (file && file.size > 0) {
      const buffer = embedCopyright(Buffer.from(await file.arrayBuffer()));
      image = await uploadMedia(`inspiration/${id}.jpg`, buffer, {
        contentType: uploadType(file.type),
        addRandomSuffix: true,
      });
    }
  }
  return {
    image,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

/**
 * Store a collector's photo of a work in their home.
 *
 * Re-encoded with its metadata gone and no copyright stamped on it — the
 * opposite of everything else this file uploads, because the photograph is
 * theirs. prepareHomePhoto() explains why, and why it throws rather than
 * passing an unreadable file through.
 */
async function uploadHomePhoto(file: File, id: string): Promise<string> {
  const buffer = await prepareHomePhoto(Buffer.from(await file.arrayBuffer()));
  // Always a JPEG now, whatever arrived — so say so, rather than repeating
  // the original's type against a .jpg name.
  return uploadMedia(`homes/${id}.jpg`, buffer, {
    contentType: "image/jpeg",
    addRandomSuffix: true,
  });
}

/** The collector's credit line, trimmed; blank means uncredited. */
function creditFrom(formData: FormData): string | null {
  const raw = (formData.get("homePhotoCredit") as string | null)?.trim();
  return raw ? raw : null;
}

/**
 * "Refresh site" in the admin: expires every cached catalogue read at once.
 * For changes made without the admin (a script, a cron, the Neon console),
 * which otherwise show within the hour (lib/catalogue-cache.ts).
 */
export async function refreshCatalogueAction() {
  await requireAuth();
  updateTag(CATALOGUE_TAG);
  revalidatePath("/", "layout");
}

function revalidateProductPaths(id: string, slugs: string[] = []) {
  // The public pages read the catalogue through a cache (lib/catalogue-cache.ts);
  // expire it so this change shows on the next load, not within the hour.
  updateTag(CATALOGUE_TAG);
  revalidatePath("/admin/products");
  revalidatePath("/");
  revalidatePath("/photographs");
  for (const s of new Set([id, ...slugs])) {
    revalidatePath(`/products/${s}`);
    revalidatePath(`/photographs/${s}`);
  }
}

/**
 * Slugify the title into a new work's id (and so its URL), unique against
 * every id, every current slug and every retired one, so a new work can never
 * take over another's old links.
 */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  let slug = base;
  let n = 1;
  while (
    (await prisma.product.findUnique({ where: { id: slug } })) ||
    (await slugTakenBy(slug, null))
  ) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export async function requireAuth() {
  const session = await getAdminSession();
  if (!session.isLoggedIn) redirect("/admin/login");
  return session;
}
