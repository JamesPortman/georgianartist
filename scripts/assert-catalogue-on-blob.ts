/**
 * Run by `npm run build` after `prisma db push`: stop the deploy if any row
 * still names one of the image files that used to be committed under public/
 * (public/paintings, public/photographs, public/mockups).
 *
 * Those files left the repository in October 2026, once a one-off script had
 * copied them to Blob (catalogue/) and repointed the rows. A row still using an
 * old path would render a broken image with nothing failing, so this fails
 * instead, before the deploy goes live, and the previous one keeps serving.
 * To fix it: point the row at its catalogue/ copy on Blob (the admin's image
 * replacement, or the file at <blobStore>/catalogue/<same path>).
 *
 * Checks Product.image, inspirationImage, mockupImage and InstagramPost.imageUrl,
 * relative ("/paintings/x.jpg") or on the site's own origin.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { isLocalCatalogueImage } from "../lib/catalogue-images";
import { siteConfig } from "../data/siteConfig";

/** "/paintings/x.jpg" or "https://www.georgianartist.com/paintings/x.jpg" → true */
export function namesRemovedFile(url: string | null | undefined): boolean {
  if (!url) return false;
  const path = url.startsWith(siteConfig.url) ? url.slice(siteConfig.url.length) : url;
  return isLocalCatalogueImage(path);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) return; // nothing to check (e.g. a build with no database)
  assertDatabaseAllowed(process.env, "build"); // runs in the build: Vercel (with CI=1), or only a local or named database (lib/db-guard.ts)
  const prisma = new PrismaClient({
    adapter: /neon\.tech/i.test(url) ? new PrismaNeonHttp(url, {}) : new PrismaPg({ connectionString: url }),
  });
  try {
    const [products, posts] = await Promise.all([
      prisma.product.findMany({ select: { id: true, image: true, inspirationImage: true, mockupImage: true } }),
      prisma.instagramPost.findMany({ where: { status: { not: "posted" } }, select: { id: true, imageUrl: true } }),
    ]);
    const stale: string[] = [];
    for (const p of products) {
      for (const k of ["image", "inspirationImage", "mockupImage"] as const) {
        if (namesRemovedFile(p[k])) stale.push(`Product ${p.id}.${k} = ${p[k]}`);
      }
    }
    for (const p of posts) if (namesRemovedFile(p.imageUrl)) stale.push(`InstagramPost ${p.id}.imageUrl = ${p.imageUrl}`);
    if (stale.length) {
      console.error(
        [
          "",
          `Build stopped: ${stale.length} row(s) still name image files that are no longer in the repository:`,
          ...stale.map((s) => `  ${s}`),
          "",
          `Each one's copy is on Blob at ${siteConfig.blobStore}/catalogue/<same path>. Point the row there`,
          "(or replace the image in /admin), then redeploy. The previous deployment is still serving.",
          "",
        ].join("\n")
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
