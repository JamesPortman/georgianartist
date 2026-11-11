import { get } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { mediaPath, mediaPathname, privateBlobToken } from "@/lib/private-blob";

/**
 * Admin uploads in the private Blob store (lib/private-blob.ts).
 *
 * A file is served only while a visible work uses it (as its image, its
 * inspiration photo or a collector's photo), or to a signed-in admin. So a
 * work uploaded hidden can't be seen before it's published, and hiding a work
 * or removing a collector's photo stops serving the file, rather than leaving
 * it readable by anyone who kept the URL.
 *
 * Caches are the limit on that: a public answer may be cached by the CDN for
 * ten minutes and by the image optimiser for a few hours, so taking something
 * down is not instant. An admin-only answer is never cached.
 *
 * Only plain files under the upload folders are reachable (mediaPathname), so
 * nothing else in the private store, the backups above all, can be asked for.
 */
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = mediaPath(path.join("/"));
  const pathname = mediaPathname(url);
  const token = privateBlobToken();
  if (!pathname || !token) return notFound();

  const published = await prisma.product.findFirst({
    where: {
      visible: true,
      OR: [{ image: url }, { inspirationImage: url }, { homePhoto: url }],
    },
    select: { id: true },
  });
  const admin = published ? false : (await getAdminSession()).isLoggedIn === true;
  if (!published && !admin) return notFound();

  const file = await get(pathname, { access: "private", token });
  if (!file || file.statusCode !== 200) return notFound();

  return new Response(file.stream, {
    headers: {
      "Content-Type": file.blob.contentType ?? "application/octet-stream",
      "Cache-Control": published
        ? "public, max-age=600, s-maxage=600"
        : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // The Instagram cron fingerprints a post's image by these (lib/instagram.ts)
      // to notice a repaint behind an unchanged URL.
      ETag: file.blob.etag,
      "Content-Length": String(file.blob.size),
    },
  });
}
