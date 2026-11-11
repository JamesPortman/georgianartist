import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/siteConfig";

/**
 * robots.txt, generated rather than served from public/.
 *
 * It was a static file naming the sitemap's absolute URL, which made it the
 * last place the domain was written down outside the config — and the one
 * place the identity test could not see, since that scan covers app/,
 * components/ and lib/ rather than public/. A fork that changed everything
 * else would still have pointed crawlers at georgianartist.com.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
