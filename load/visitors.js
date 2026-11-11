// Load test: simulated visitors browsing the storefront. Run with k6
// (`brew install k6`):
//
//   k6 run -e BASE_URL=https://www.georgianartist.com load/visitors.js
//
// BASE_URL has no default on purpose, so nobody load-tests production by
// accident. Against production it is deliberately small and read-only:
//
//   - GET requests for pages only. No forms, no admin, no API writes, so no
//     emails, orders or database writes. k6 doesn't run JavaScript, so the
//     analytics tracker and GA4 never fire and the dashboard stays clean.
//   - Ramps up to 50 simultaneous visitors, each pausing 1–3s between pages the
//     way a person does, for about three and a half minutes.
//   - Stops itself if more than 1% of requests fail or pages get slow (p95 over
//     3s), rather than pushing on into a site that is already struggling.
//
// Every page is rendered per request (force-dynamic), so each request is a
// real function invocation plus Neon queries. That is the path under test;
// images and static chunks come from the CDN and aren't requested.
//
// Results from each production run belong in /architecture §10.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) throw new Error("Set BASE_URL, e.g. -e BASE_URL=http://localhost:3000");

const PAGES = ["home", "product", "photograph", "gallery", "gift-shop", "locations", "making-of"];

export const options = {
  stages: [
    { duration: "1m", target: 10 },
    { duration: "1m", target: 50 },
    { duration: "1m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "15s" }],
    http_req_duration: [{ threshold: "p(95)<3000", abortOnFail: true, delayAbortEval: "30s" }],
    checks: ["rate>0.99"],
    // One entry per page so the summary breaks timings down by page.
    ...Object.fromEntries(PAGES.map((p) => [`http_req_duration{page:${p}}`, ["p(95)<3000"]])),
  },
  // Identifies the traffic in Vercel's logs.
  userAgent: "GeorgianArtist-loadtest/1 (k6; run by the site owner)",
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

// The work pages come from the sitemap, so the test follows the live catalogue.
export function setup() {
  const xml = http.get(`${BASE_URL}/sitemap.xml`).body || "";
  const locs = [...xml.matchAll(/<loc>[^<]*?(\/(?:products|photographs)\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  const products = locs.filter((l) => l.startsWith("/products/"));
  const photographs = locs.filter((l) => l.startsWith("/photographs/"));
  if (!products.length || !photographs.length) throw new Error("No work pages found in the sitemap");
  return { products, photographs };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function visit(path, page) {
  const res = http.get(`${BASE_URL}${path}`, { tags: { page } });
  check(res, {
    "status 200": (r) => r.status === 200,
    // A 200 with an error shell is still an outage to a visitor.
    "rendered the storefront": (r) => typeof r.body === "string" && r.body.includes("</nav>"),
  });
  sleep(1 + Math.random() * 2);
}

// One iteration is one short visit: the gallery, a couple of works, one more page.
export default function visitor(data) {
  visit("/", "home");
  visit(pick(data.products), "product");
  if (Math.random() < 0.5) visit(pick(data.photographs), "photograph");
  else visit("/photographs", "gallery");
  const [path, page] = pick([
    ["/gift-shop", "gift-shop"],
    ["/locations", "locations"],
    ["/making-of", "making-of"],
  ]);
  visit(path, page);
}
