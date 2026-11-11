import { prisma } from "@/lib/db";
import { productPath } from "@/lib/product-path";
import { catalogue } from "@/lib/catalogue-cache";

/**
 * Find the visible work a URL slug names, or where that slug moved to.
 *
 * Current slugs win: a work is found by its `slug`, or by its `id` when it has
 * never been renamed (slug null). Only if nothing answers to it now is the
 * slug looked up in `ProductSlug`, the history of retired slugs, which answers
 * with the work's current path for a permanent redirect. A slug that matches
 * nothing at all is a 404, as before. Public, so it reads through the
 * catalogue cache; slugTakenBy() below decides a write, so it never does.
 */
export async function findWorkBySlug(slug: string, type: "painting" | "photograph") {
  const work = await catalogue.product.findFirst({
    where: { type, visible: true, OR: [{ slug }, { slug: null, id: slug }] },
  });
  if (work) return { work, redirect: null };

  const old = await catalogue.productSlug.findUnique({ where: { slug } });
  if (old) {
    const moved = await catalogue.product.findFirst({
      where: { id: old.productId, visible: true },
      select: { id: true, type: true, slug: true },
    });
    if (moved) return { work: null, redirect: productPath(moved) };
  }
  return { work: null, redirect: null };
}

/**
 * Whether a slug is free for this product: not another work's current slug,
 * not another never-renamed work's id, and not another work's retired slug
 * (which would silently take over that work's old links).
 */
export async function slugTakenBy(slug: string, productId: string | null): Promise<string | null> {
  const current = await prisma.product.findFirst({
    where: { OR: [{ slug }, { slug: null, id: slug }], ...(productId ? { NOT: { id: productId } } : {}) },
    select: { id: true },
  });
  if (current) return current.id;
  const old = await prisma.productSlug.findUnique({ where: { slug } });
  if (old && old.productId !== productId) return old.productId;
  return null;
}
