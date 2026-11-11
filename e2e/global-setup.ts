import { prisma } from "../lib/db";
import { PHOTO_WITH_MAP, PHOTO_PANORAMIC, PHOTO_WITHOUT_GPS } from "./fixtures";
import { assertThrowawayDatabase, OVERRIDE_ENV } from "./db-guard";

/**
 * Seeds deterministic location data for the inspiration / photo-location E2Es:
 *   - council-beach (painting)     → inspiration photo + GPS
 *   - PHOTO_WITH_MAP (photo)       → GPS, standard layout
 *   - PHOTO_PANORAMIC (photo)      → GPS, panoramic layout (map renders elsewhere)
 * Coordinates are the real ones the live catalog uses (Delphi Point's came
 * from the photo's own EXIF), so fixtures and production agree.
 * PHOTO_WITHOUT_GPS is deliberately CLEARED of GPS as the negative case —
 * the no-map path needs cover. It used to rely on the seed simply not having
 * coordinates for it, which quietly stopped being true once the seed was
 * backfilled from production; stating the requirement is safer than depending
 * on data staying incomplete.
 * Best-effort: ignored if a row isn't present.
 */
export default async function globalSetup() {
  // Before the first write, and before any spec runs: this suite is destructive
  // and `.env.local` points at production. See e2e/db-guard.ts.
  assertThrowawayDatabase(process.env.DATABASE_URL, process.env[OVERRIDE_ENV]);

  const fixtures: { id: string; data: Record<string, unknown> }[] = [
    {
      id: "council-beach",
      data: {
        inspirationImage: "/photographs/Delphi_Point.jpg",
        inspirationLat: 44.5,
        inspirationLng: -80.4,
      },
    },
    { id: PHOTO_WITH_MAP, data: { inspirationLat: 44.55429, inspirationLng: -80.460466 } },
    { id: PHOTO_PANORAMIC, data: { inspirationLat: 45.2452292, inspirationLng: -81.524182 } },
    { id: PHOTO_WITHOUT_GPS, data: { inspirationLat: null, inspirationLng: null } },
  ];

  for (const f of fixtures) {
    try {
      await prisma.product.update({ where: { id: f.id }, data: f.data });
    } catch {
      // Row not seeded (or DB unavailable) — the dependent spec will fail loudly.
    }
  }

  // Every request in this suite comes from one address, so the public forms'
  // per-IP limit (lib/form-rate-limit.ts) would otherwise carry over between
  // runs against the same database — and a retried test counts twice. Start
  // each run from zero.
  try {
    await prisma.formRateLimit.deleteMany({});
  } catch {
    // Table missing (schema not pushed) — the API specs will say so.
  }

  // No passkeys left over from an interrupted run (e2e/zz-admin-passkey.spec.ts).
  try {
    await prisma.adminPasskey.deleteMany({});
  } catch {
    // Table missing: the passkey spec will say so.
  }
}
